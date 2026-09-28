<?php

namespace App\Services\Marketplace\Basalam;

use App\Models\MarketplaceProductMap;
use App\Models\Product;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Basalam strikethrough discounts (port of DiscountManager + DiscountTaskProcessor + DiscountTaskScheduler).
 * Tasks store Basalam product/variation ids and are sent grouped by percent, active days and action.
 */
class BasalamDiscounts
{
    public const TABLE = 'basalam_discount_tasks';

    public const PENDING = 'pending';

    public const PROCESSING = 'processing';

    public const FAILED = 'failed';

    public function __construct(protected BasalamClient $client) {}

    public static function for(int $tenantId): self
    {
        return new self(BasalamClient::for($tenantId));
    }

    protected function tid(): int
    {
        return $this->client->tenantId();
    }

    protected function engine(): array
    {
        return (new BasalamSettings(app(MarketplaceSettingsService::class)))->engine($this->tid());
    }

    public static function percent(float $regular, float $sale): int
    {
        if ($regular <= 0) {
            return 0;
        }

        return (int) round(($regular - $sale) / $regular * 100);
    }

    /** Queue apply/remove tasks for every Basalam map of a product after a price change. */
    public function handleProduct(Product $product): int
    {
        $engine = $this->engine();
        $maps = MarketplaceProductMap::query()->with('variant')->where('tenant_id', $this->tid())
            ->where('product_id', $product->id)->where('platform', 'basalam')->whereNotNull('remote_product_id')->get();
        if ($maps->isEmpty()) {
            return 0;
        }
        $saleMode = ($engine['product_price_field'] ?? '') === 'sale_strikethrough_price';
        $items = [];
        foreach ($maps as $map) {
            if ($this->hasConflict($map)) {
                continue;
            }
            $src = $map->variant ?? $product;
            if ($map->product_variant_id && ! $map->variant) {
                continue;
            }
            if (! $saleMode) {
                if (! empty(($map->meta ?? [])['discounted'])) {
                    $items[] = ['map' => $map, 'action' => 'remove'];
                }

                continue;
            }
            $regular = (float) ($src->price_minor ?: $product->price_minor);
            $sale = (float) ($product->effectiveSalePriceMinor($map->variant) ?? 0);
            if ($sale > 0 && $regular > 0) {
                $pct = self::percent($regular, $sale);
                if ($pct > 0) {
                    $items[] = ['map' => $map, 'action' => 'apply', 'discount_percent' => $pct];
                }
            } else {
                $items[] = ['map' => $map, 'action' => 'remove'];
            }
        }

        return $items ? $this->queue($items) : 0;
    }

    /** Another local product sharing the same Basalam id would receive our discount. */
    protected function hasConflict(MarketplaceProductMap $map): bool
    {
        return MarketplaceProductMap::query()->where('tenant_id', $this->tid())->where('platform', 'basalam')
            ->where('remote_product_id', $map->remote_product_id)
            ->where('product_id', '!=', $map->product_id)->exists();
    }

    /**
     * @param  list<array{map: MarketplaceProductMap, action: string, discount_percent?: float, active_days?: int}>  $items
     */
    public function queue(array $items): int
    {
        $engine = $this->engine();
        $reduction = (int) max(0, (float) ($engine['discount_reduction_percent'] ?? 0));
        $created = 0;
        foreach ($items as $item) {
            $map = $item['map'];
            $action = $item['action'] === 'remove' ? 'remove' : 'apply';
            $pct = (float) ($item['discount_percent'] ?? 0);
            if ($action === 'apply' && $reduction > 0 && $pct > $reduction) {
                $pct -= $reduction;
            }
            $standalone = ! empty(($map->meta ?? [])['standalone']) || ! $map->remote_variant_id;
            DB::table(self::TABLE)->insert([
                'tenant_id' => $this->tid(),
                'product_id' => (int) $map->remote_product_id,
                'product_variant_id' => $standalone ? null : (int) $map->remote_variant_id,
                'discount_percent' => $action === 'apply' ? $pct : 0,
                'active_days' => (int) ($item['active_days'] ?? ($engine['discount_duration'] ?: 7)),
                'action' => $action,
                'status' => self::PENDING,
                'scheduled_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $meta = $map->meta ?? [];
            if ($action === 'apply') {
                $meta['discounted'] = true;
            } else {
                unset($meta['discounted']);
            }
            $map->update(['meta' => $meta]);
            $created++;
        }

        return $created;
    }

    /**
     * Send one group of runnable tasks (at most every 30 seconds per tenant, like the WP scheduler).
     *
     * @return array<string, mixed>
     */
    public function process(bool $force = false): array
    {
        if (! $force && ! Cache::add('marketplace:basalam:discount-tick:'.$this->tid(), 1, 30)) {
            return ['skipped' => 'throttled'];
        }
        $pending = DB::table(self::TABLE)->where('tenant_id', $this->tid())->where('status', self::PENDING)
            ->where('scheduled_at', '<=', now())
            ->orderByRaw("case when action = 'apply' then 0 else 1 end")->orderBy('scheduled_at')->orderBy('discount_percent')
            ->get();
        if ($pending->isEmpty()) {
            return ['processed' => 0, 'remaining' => 0];
        }
        $first = $pending->first();
        $group = $pending->filter(fn ($t) => (string) $t->action === (string) $first->action
            && (float) $t->discount_percent === (float) $first->discount_percent
            && (int) $t->active_days === (int) $first->active_days);
        $ids = $group->pluck('id')->all();
        $productIds = $group->pluck('product_id')->filter()->map(fn ($v) => (int) $v)->unique()->values()->all();
        $variationIds = $group->pluck('product_variant_id')->filter()->map(fn ($v) => (int) $v)->unique()->values()->all();

        DB::table(self::TABLE)->whereIn('id', $ids)->update(['status' => self::PROCESSING, 'updated_at' => now()]);
        $url = sprintf(BasalamEndpoints::VENDOR_DISCOUNTS, $this->client->vendorId());
        try {
            if ($first->action === 'remove') {
                $this->client->delete($url, ['product_filter' => ['product_ids' => $productIds, 'variation_ids' => $variationIds]]);
            } else {
                $this->client->post($url, [
                    'product_filter' => ['product_ids' => $productIds, 'variation_ids' => $variationIds, 'status' => [3568, 2976]],
                    'discount_percent' => (float) $first->discount_percent,
                    'active_days' => (int) $first->active_days,
                ]);
            }
            DB::table(self::TABLE)->whereIn('id', $ids)->delete();
            MarketplaceLogger::info($this->tid(), 'basalam', 'discount', 'Discount '.$first->action.' sent', ['tasks' => count($ids), 'percent' => (float) $first->discount_percent]);
        } catch (MarketplaceException $e) {
            DB::table(self::TABLE)->whereIn('id', $ids)->update([
                'status' => $e->isTransient() ? self::PENDING : self::FAILED,
                'scheduled_at' => $e->isTransient() ? now()->addMinutes(2) : now(),
                'processed_at' => now(),
                'error_message' => mb_substr($e->getMessage(), 0, 1000),
                'updated_at' => now(),
            ]);
            MarketplaceLogger::error($this->tid(), 'basalam', 'discount', 'Discount '.$first->action.' failed: '.$e->getMessage(), ['tasks' => count($ids)]);
        }

        return [
            'processed' => count($ids),
            'remaining' => DB::table(self::TABLE)->where('tenant_id', $this->tid())->where('status', self::PENDING)->count(),
        ];
    }

    /** @return array{pending: int, processing: int, failed: int, recent_failures: list<array<string, mixed>>} */
    public function stats(): array
    {
        $base = DB::table(self::TABLE)->where('tenant_id', $this->tid());

        return [
            'pending' => (clone $base)->where('status', self::PENDING)->count(),
            'processing' => (clone $base)->where('status', self::PROCESSING)->count(),
            'failed' => (clone $base)->where('status', self::FAILED)->count(),
            'recent_failures' => (clone $base)->where('status', self::FAILED)->orderByDesc('id')->limit(10)
                ->get(['product_id', 'product_variant_id', 'action', 'discount_percent', 'error_message', 'processed_at'])
                ->map(fn ($r) => (array) $r)->all(),
        ];
    }

    public function clearFailed(): int
    {
        return DB::table(self::TABLE)->where('tenant_id', $this->tid())->where('status', self::FAILED)->delete();
    }
}
