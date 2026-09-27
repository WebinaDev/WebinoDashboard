<?php

namespace App\Jobs;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Pricing\PricingCalculator;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Throwable;

/**
 * Port of WFCP_Batch_Process::queue_recalculate — re-derive retail prices from purchase prices.
 */
class RecalculatePricesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 900;

    public function __construct(
        public int $tenantId,
        public bool $dryRun,
        public string $runId,
    ) {}

    public static function cacheKey(int $tenantId): string
    {
        return 'pricing:recalc:'.$tenantId;
    }

    /** @return array<string, mixed> */
    public static function state(int $tenantId): array
    {
        return Cache::get(self::cacheKey($tenantId), ['status' => 'idle']);
    }

    /** @return array<string, mixed> */
    public static function start(int $tenantId, bool $dryRun): array
    {
        $total = Product::query()->where('tenant_id', $tenantId)->where('purchase_price_minor', '>', 0)->count()
            + ProductVariant::query()->where('tenant_id', $tenantId)->where('purchase_price_minor', '>', 0)->count();
        $state = [
            'status' => 'queued',
            'run_id' => (string) Str::uuid(),
            'dry_run' => $dryRun,
            'total' => $total,
            'processed' => 0,
            'updated' => 0,
            'skipped' => 0,
            'changes' => [],
            'started_at' => now()->toIso8601String(),
        ];
        Cache::put(self::cacheKey($tenantId), $state, now()->addDay());
        self::dispatch($tenantId, $dryRun, $state['run_id']);

        return self::state($tenantId);
    }

    public function handle(): void
    {
        $state = self::state($this->tenantId);
        if (($state['run_id'] ?? null) !== $this->runId) {
            return;
        }
        $state['status'] = 'running';
        $this->save($state);
        $calc = PricingCalculator::forTenant($this->tenantId);

        try {
            Product::query()->where('tenant_id', $this->tenantId)->where('purchase_price_minor', '>', 0)
                ->chunkById(100, function ($products) use ($calc, &$state) {
                    foreach ($products as $product) {
                        $this->apply($product, $product->lock_price, $calc, $state);
                    }
                    $this->save($state);
                });
            ProductVariant::query()->where('tenant_id', $this->tenantId)->where('purchase_price_minor', '>', 0)->with('product')
                ->chunkById(100, function ($variants) use ($calc, &$state) {
                    foreach ($variants as $variant) {
                        $locked = (bool) ($variant->lock_price || $variant->product?->lock_price);
                        $this->apply($variant, $locked, $calc, $state);
                    }
                    $this->save($state);
                });
            $state['status'] = 'done';
        } catch (Throwable $e) {
            $state['status'] = 'failed';
            $state['error'] = $e->getMessage();
        }
        $state['finished_at'] = now()->toIso8601String();
        $this->save($state);
    }

    /** @param array<string, mixed> $state */
    protected function apply(Product|ProductVariant $model, bool $locked, PricingCalculator $calc, array &$state): void
    {
        $state['processed']++;
        if ($locked) {
            $state['skipped']++;

            return;
        }
        $retail = (int) round($calc->calculate((float) $model->purchase_price_minor, 'retail'));
        if ($retail <= 0 || $retail === (int) $model->price_minor) {
            return;
        }
        if (count($state['changes']) < 50) {
            $state['changes'][] = ['id' => $model->id, 'variant' => $model instanceof ProductVariant, 'from' => (int) $model->price_minor, 'to' => $retail];
        }
        $state['updated']++;
        if (! $this->dryRun) {
            $model->update(['price_minor' => $retail]);
        }
    }

    /** @param array<string, mixed> $state */
    protected function save(array $state): void
    {
        Cache::put(self::cacheKey($this->tenantId), $state, now()->addDay());
    }
}
