<?php

namespace App\Services\Marketplace;

use App\Jobs\RunMarketplaceJob;
use App\Models\MarketplaceJob;
use App\Models\MarketplaceProductMap;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Tenant;
use Illuminate\Support\Carbon;
use InvalidArgumentException;
use Throwable;

/**
 * Queue orchestration for marketplace work: price/stock pushes, sync-all, order pulls and platform jobs.
 */
class MarketplaceSync
{
    public const PUSH = 'push_price_stock';

    public const PULL_ORDERS = 'pull_orders';

    public const SYNC_ALL = 'sync_all';

    public function __construct(
        protected MarketplaceSettingsService $settings,
        protected MarketplaceOrderImporter $orders,
    ) {}

    /**
     * Record a job row and dispatch it; pending duplicates (same dedupe key) are reused.
     *
     * @param  array<string, mixed>  $payload
     */
    public function enqueue(int $tenantId, string $platform, string $type, array $payload = [], int $priority = 5, int $delaySeconds = 0, ?string $dedupeKey = null): MarketplaceJob
    {
        $dedupeKey ??= $type.':'.md5(json_encode($payload));
        $existing = MarketplaceJob::query()
            ->where('tenant_id', $tenantId)
            ->where('platform', $platform)
            ->where('job_type', $type)
            ->whereIn('status', ['pending', 'retrying'])
            ->get()
            ->first(fn (MarketplaceJob $j) => ($j->payload['_key'] ?? null) === $dedupeKey);
        if ($existing) {
            return $existing;
        }

        $row = MarketplaceJob::query()->create([
            'tenant_id' => $tenantId,
            'platform' => $platform,
            'job_type' => $type,
            'priority' => $priority,
            'payload' => array_merge($payload, ['_key' => $dedupeKey]),
            'status' => 'pending',
        ]);

        $pending = RunMarketplaceJob::dispatch($row->id);
        if ($delaySeconds > 0) {
            $pending->delay(now()->addSeconds($delaySeconds));
        }
        unset($pending);

        return $row->fresh() ?? $row;
    }

    /** @return array<string, mixed> */
    public function execute(MarketplaceJob $row): array
    {
        $payload = $row->payload ?? [];

        return match ($row->job_type) {
            self::PUSH => $this->pushMap((int) ($payload['map_id'] ?? 0)),
            self::SYNC_ALL => $this->syncAll($row->tenant_id, $row->platform),
            self::PULL_ORDERS => $this->pullOrders($row->tenant_id, $row->platform, $payload),
            default => $this->platformJob($row),
        };
    }

    /** @return array<string, mixed> */
    protected function platformJob(MarketplaceJob $row): array
    {
        $adapter = MarketplaceAdapterRegistry::make($row->platform, $row->tenant_id);
        if (! method_exists($adapter, 'runJob')) {
            throw new InvalidArgumentException("Unknown marketplace job type [{$row->job_type}]");
        }

        return (array) $adapter->runJob($row->job_type, $row->payload ?? []);
    }

    /**
     * Push current price+stock for one map. Remote ids are never cleared on failure.
     *
     * @return array<string, mixed>
     */
    public function pushMap(int $mapId): array
    {
        $map = MarketplaceProductMap::query()->with(['product', 'variant'])->find($mapId);
        if (! $map || ! $map->product) {
            return ['skipped' => 'missing'];
        }
        if (MarketplacePlatforms::isFeed($map->platform)) {
            return ['skipped' => 'feed'];
        }

        $adapter = MarketplaceAdapterRegistry::make($map->platform, $map->tenant_id);
        if (method_exists($adapter, 'priceStockFor')) {
            [$price, $stock] = $adapter->priceStockFor($map);
        } else {
            $pricing = MarketplacePricing::forTenant($map->tenant_id);
            $price = $pricing->priceFor($map->product, $map->variant, $map->platform);
            $stock = $pricing->stockFor($map->product, $map->variant);
        }

        try {
            $adapter->pushPriceStock($map, $price, $stock);
        } catch (Throwable $e) {
            $map->update(['last_error' => mb_substr($e->getMessage(), 0, 2000), 'last_sync_at' => now()]);
            throw $e;
        }

        $map->update([
            'last_sync_at' => now(),
            'last_error' => null,
            'remote_price' => $price,
            'remote_stock' => $stock,
        ]);

        return ['price' => $price, 'stock' => $stock];
    }

    /** @return array<string, mixed> */
    public function syncAll(int $tenantId, string $platform): array
    {
        $ok = 0;
        $failed = 0;
        MarketplaceProductMap::query()
            ->where('tenant_id', $tenantId)
            ->where('platform', $platform)
            ->where('sync_enabled', true)
            ->orderBy('id')
            ->chunkById(100, function ($maps) use (&$ok, &$failed) {
                foreach ($maps as $map) {
                    try {
                        $this->pushMap($map->id);
                        $ok++;
                    } catch (Throwable) {
                        $failed++;
                    }
                }
            });
        MarketplaceLogger::info($tenantId, $platform, 'sync', 'Sync all finished', ['ok' => $ok, 'failed' => $failed]);

        return ['ok' => $ok, 'failed' => $failed];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function pullOrders(int $tenantId, string $platform, array $args = []): array
    {
        $adapter = MarketplaceAdapterRegistry::make($platform, $tenantId);
        $list = $adapter->pullOrders(array_diff_key($args, ['_key' => 1, 'result' => 1]));

        return $this->orders->importMany($tenantId, $adapter, $list);
    }

    /** Called by product/variant observers; queues a delayed push per eligible map. */
    public function productChanged(Product $product, ?ProductVariant $variant = null): void
    {
        $query = MarketplaceProductMap::query()
            ->where('product_id', $product->id)
            ->where('sync_enabled', true);
        if ($variant) {
            $query->where('product_variant_id', $variant->id);
        }
        $basalamQueued = false;
        foreach ($query->get() as $map) {
            if ($map->platform === 'basalam') {
                if (! $basalamQueued && $this->settings->isEnabled($map->tenant_id, 'basalam')) {
                    $basalamQueued = true;
                    Basalam\BasalamProducts::for($map->tenant_id)->productChanged($product);
                }

                continue;
            }
            if (MarketplacePlatforms::isFeed($map->platform) || ! $this->settings->isAutoSync($map->tenant_id, $map->platform)) {
                continue;
            }
            $this->enqueue($map->tenant_id, $map->platform, self::PUSH, ['map_id' => $map->id], 3, 5, self::PUSH.':'.$map->id);
        }
    }

    /** Scheduler: queue order pulls for every enabled order-capable platform. */
    public function pullAllOrders(): void
    {
        foreach (Tenant::query()->pluck('id') as $tenantId) {
            foreach (MarketplacePlatforms::CATALOG as $slug => $meta) {
                // Basalam polls from BasalamScheduler, gated by its sync_status_order setting.
                if (! $meta['orders'] || $slug === 'basalam' || ! $this->settings->isEnabled((int) $tenantId, $slug)) {
                    continue;
                }
                $this->enqueue((int) $tenantId, $slug, self::PULL_ORDERS, [], 5, 0, self::PULL_ORDERS);
            }
        }
    }

    /** Scheduler: re-dispatch stuck jobs and prune history. */
    public function maintain(): void
    {
        MarketplaceJob::query()
            ->where('status', 'running')
            ->where('started_at', '<', now()->subMinutes(10))
            ->get()
            ->each(function (MarketplaceJob $job) {
                if ($job->attempts >= 5) {
                    $job->update(['status' => 'failed', 'last_error' => $job->last_error ?: 'Timed out', 'finished_at' => now()]);

                    return;
                }
                $job->update(['status' => 'pending']);
                RunMarketplaceJob::dispatch($job->id);
            });

        MarketplaceJob::query()
            ->where('status', 'pending')
            ->where('created_at', '<', now()->subMinutes(30))
            ->whereNull('started_at')
            ->get()
            ->each(fn (MarketplaceJob $job) => RunMarketplaceJob::dispatch($job->id));

        MarketplaceJob::query()->whereIn('status', ['done', 'cancelled'])->where('updated_at', '<', Carbon::now()->subDays(7))->delete();
        MarketplaceJob::query()->where('status', 'failed')->where('updated_at', '<', Carbon::now()->subDays(30))->delete();
        \App\Models\MarketplaceLog::query()->where('created_at', '<', Carbon::now()->subDays(30))->delete();
    }

    public function retry(MarketplaceJob $job): MarketplaceJob
    {
        $job->update(['status' => 'pending', 'attempts' => 0, 'last_error' => null, 'started_at' => null, 'finished_at' => null]);
        RunMarketplaceJob::dispatch($job->id);

        return $job->fresh() ?? $job;
    }
}
