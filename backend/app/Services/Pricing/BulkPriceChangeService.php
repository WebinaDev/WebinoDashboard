<?php

namespace App\Services\Pricing;

use App\Models\BulkPriceJob;
use App\Models\BulkPriceJobItem;
use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Cursor-based bulk price changer: small batches, per-product transactions,
 * job-scoped apply signatures (idempotent resume), and row locks so two ticks
 * never process the same job concurrently.
 */
class BulkPriceChangeService
{
    public const BATCH_SIZE = 25;

    public const MAX_BATCHES_PER_TICK = 8;

    public const SLEEP_MS_BETWEEN_BATCHES = 150;

    public const STALE_LOCK_MINUTES = 10;

    public const ENABLED_FIELDS = ['price_minor', 'sale_price_minor'];

    /** @param  array<string, mixed>  $raw */
    public function normalizeParams(array $raw): array
    {
        $changeType = ($raw['change_type'] ?? 'percent') === 'fixed' ? 'fixed' : 'percent';
        $direction = ($raw['direction'] ?? 'increase') === 'decrease' ? 'decrease' : 'increase';
        $value = abs((float) ($raw['value'] ?? 0));
        $fields = $this->normalizeFields($raw['fields'] ?? null, (bool) ($raw['apply_to_sale'] ?? false));

        return [
            'change_type' => $changeType,
            'direction' => $direction,
            'value' => $value,
            'fields' => $fields,
            'apply_to_sale' => in_array('sale_price_minor', $fields, true),
            'apply_to_variants' => (bool) ($raw['apply_to_variants'] ?? false),
            'rounding' => (bool) ($raw['rounding'] ?? false),
            'round_step' => max(1, (int) ($raw['round_step'] ?? 1000)),
            'dry_run' => (bool) ($raw['dry_run'] ?? false),
            'filters' => $this->normalizeFilters(is_array($raw['filters'] ?? null) ? $raw['filters'] : $raw),
        ];
    }

    /** @param  array<string, mixed>  $raw */
    public function normalizeFilters(array $raw): array
    {
        $ids = static fn (mixed $v): array => array_values(array_unique(array_filter(array_map(
            'intval',
            is_array($v) ? $v : (($v === null || $v === '') ? [] : explode(',', (string) $v))
        ), fn ($n) => $n > 0)));

        $slugs = static fn (mixed $v): array => array_values(array_filter(array_map(
            'trim',
            array_map('strval', is_array($v) ? $v : (($v === null || $v === '') ? [] : explode(',', (string) $v)))
        )));

        $boolOrNull = static function (mixed $v): ?bool {
            if ($v === null || $v === '') {
                return null;
            }
            if (is_bool($v)) {
                return $v;
            }

            return filter_var($v, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        };

        $status = trim((string) ($raw['status'] ?? 'publish'));
        if ($status === '' || $status === 'all') {
            $status = null;
        }

        return [
            'category_ids' => $ids($raw['category_ids'] ?? null),
            'category_slugs' => $slugs($raw['category_slugs'] ?? null),
            'brand_ids' => $ids($raw['brand_ids'] ?? null),
            'tag_ids' => $ids($raw['tag_ids'] ?? null),
            'status' => $status,
            'type' => ($t = trim((string) ($raw['type'] ?? ''))) !== '' ? $t : null,
            'stock_status' => ($s = trim((string) ($raw['stock_status'] ?? ''))) !== '' ? $s : null,
            'stock_min' => isset($raw['stock_min']) && $raw['stock_min'] !== '' ? (int) $raw['stock_min'] : null,
            'stock_max' => isset($raw['stock_max']) && $raw['stock_max'] !== '' ? (int) $raw['stock_max'] : null,
            'is_featured' => $boolOrNull($raw['is_featured'] ?? null),
            'on_sale' => $boolOrNull($raw['on_sale'] ?? null),
            'has_variants' => $boolOrNull($raw['has_variants'] ?? null),
            'include_locked' => (bool) ($raw['include_locked'] ?? false),
            'sku' => ($sku = trim((string) ($raw['sku'] ?? ''))) !== '' ? $sku : null,
            'search' => ($q = trim((string) ($raw['search'] ?? ''))) !== '' ? $q : null,
            'catalog_visibility' => ($cv = trim((string) ($raw['catalog_visibility'] ?? ''))) !== '' ? $cv : null,
            'created_from' => ($d = trim((string) ($raw['created_from'] ?? ''))) !== '' ? $d : null,
            'created_to' => ($d = trim((string) ($raw['created_to'] ?? ''))) !== '' ? $d : null,
            'updated_from' => ($d = trim((string) ($raw['updated_from'] ?? ''))) !== '' ? $d : null,
            'updated_to' => ($d = trim((string) ($raw['updated_to'] ?? ''))) !== '' ? $d : null,
            'price_min' => isset($raw['price_min']) && $raw['price_min'] !== '' ? (int) $raw['price_min'] : null,
            'price_max' => isset($raw['price_max']) && $raw['price_max'] !== '' ? (int) $raw['price_max'] : null,
        ];
    }

    /** @param  array<string, mixed>  $filters */
    public function productQuery(int $tenantId, array $filters): Builder
    {
        $q = Product::query()->where('tenant_id', $tenantId)->where('status', '!=', 'trash');

        $status = $filters['status'] ?? 'publish';
        if ($status) {
            $q->where('status', $status);
        }

        $slugs = $filters['category_slugs'] ?? [];
        $catIds = $filters['category_ids'] ?? [];
        if ($slugs !== [] || $catIds !== []) {
            $q->where(function ($w) use ($slugs, $catIds) {
                if ($catIds !== []) {
                    $w->where(function ($inner) use ($catIds) {
                        $inner->whereIn('category_id', $catIds)
                            ->orWhereHas('categories', fn ($c) => $c->whereIn('categories.id', $catIds));
                    });
                }
                if ($slugs !== []) {
                    $method = $catIds !== [] ? 'orWhere' : 'where';
                    $w->{$method}(function ($inner) use ($slugs) {
                        $inner->whereHas('category', fn ($c) => $c->whereIn('slug', $slugs))
                            ->orWhereHas('categories', fn ($c) => $c->whereIn('categories.slug', $slugs));
                    });
                }
            });
        }

        if (($filters['brand_ids'] ?? []) !== []) {
            $q->whereHas('brands', fn ($b) => $b->whereIn('brands.id', $filters['brand_ids']));
        }
        if (($filters['tag_ids'] ?? []) !== []) {
            $q->whereHas('tags', fn ($t) => $t->whereIn('product_tags.id', $filters['tag_ids']));
        }
        if (! empty($filters['type'])) {
            $q->where('type', $filters['type']);
        }
        if (! empty($filters['stock_status'])) {
            $q->where('stock_status', $filters['stock_status']);
        }
        if ($filters['stock_min'] !== null) {
            $q->where('stock', '>=', $filters['stock_min']);
        }
        if ($filters['stock_max'] !== null) {
            $q->where('stock', '<=', $filters['stock_max']);
        }
        if ($filters['is_featured'] !== null) {
            $q->where('is_featured', $filters['is_featured']);
        }
        if ($filters['on_sale'] === true) {
            $q->whereNotNull('sale_price_minor')->where('sale_price_minor', '>', 0)
                ->where(function ($w) {
                    $w->whereColumn('sale_price_minor', '<', 'price_minor')
                        ->orWhere('price_minor', '<=', 0);
                });
        } elseif ($filters['on_sale'] === false) {
            $q->where(function ($w) {
                $w->whereNull('sale_price_minor')->orWhere('sale_price_minor', '<=', 0);
            });
        }
        if ($filters['has_variants'] === true) {
            $q->whereHas('variants');
        } elseif ($filters['has_variants'] === false) {
            $q->whereDoesntHave('variants');
        }
        if (empty($filters['include_locked'])) {
            $q->where(function ($w) {
                $w->where('lock_price', false)->orWhereNull('lock_price');
            });
        }
        if (! empty($filters['sku'])) {
            $like = '%'.$filters['sku'].'%';
            $q->where('sku', 'like', $like);
        }
        if (! empty($filters['search'])) {
            $like = '%'.$filters['search'].'%';
            $q->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)
                    ->orWhere('sku', 'like', $like)
                    ->orWhere('slug', 'like', $like);
            });
        }
        if (! empty($filters['catalog_visibility'])) {
            $q->where('catalog_visibility', $filters['catalog_visibility']);
        }
        if (! empty($filters['created_from'])) {
            $q->whereDate('created_at', '>=', $filters['created_from']);
        }
        if (! empty($filters['created_to'])) {
            $q->whereDate('created_at', '<=', $filters['created_to']);
        }
        if (! empty($filters['updated_from'])) {
            $q->whereDate('updated_at', '>=', $filters['updated_from']);
        }
        if (! empty($filters['updated_to'])) {
            $q->whereDate('updated_at', '<=', $filters['updated_to']);
        }
        if ($filters['price_min'] !== null) {
            $q->where('price_minor', '>=', $filters['price_min']);
        }
        if ($filters['price_max'] !== null) {
            $q->where('price_minor', '<=', $filters['price_max']);
        }

        return $q;
    }

    /** @param  array<string, mixed>  $params */
    public function createJob(int $tenantId, array $params): BulkPriceJob
    {
        $this->releaseStaleLocks($tenantId);
        if ($this->hasActiveJob($tenantId)) {
            throw new \RuntimeException('A bulk price job is already running');
        }

        $normalized = $this->normalizeParams($params);
        $total = (clone $this->productQuery($tenantId, $normalized['filters']))->count();

        return BulkPriceJob::query()->create([
            'tenant_id' => $tenantId,
            'status' => BulkPriceJob::STATUS_PENDING,
            'stage' => BulkPriceJob::STAGE_COUNTING,
            'cursor_product_id' => 0,
            'params' => $normalized,
            'state' => $this->emptyState($total, $normalized['dry_run']),
            'locked' => false,
            'locked_at' => null,
            'last_log' => $normalized['dry_run'] ? 'Dry-run job queued' : 'Job queued',
        ]);
    }

    public function hasActiveJob(int $tenantId, ?int $exceptJobId = null, bool $includePaused = true): bool
    {
        $this->releaseStaleLocks($tenantId);
        $statuses = [BulkPriceJob::STATUS_PENDING, BulkPriceJob::STATUS_RUNNING];
        if ($includePaused) {
            $statuses[] = BulkPriceJob::STATUS_PAUSED;
        }
        $q = BulkPriceJob::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', $statuses);
        if ($exceptJobId !== null) {
            $q->where('id', '!=', $exceptJobId);
        }

        return $q->exists();
    }

    public function releaseStaleLocks(?int $tenantId = null): void
    {
        $q = BulkPriceJob::query()
            ->where('locked', true)
            ->where(function ($w) {
                $w->whereNull('locked_at')
                    ->orWhere('locked_at', '<', now()->subMinutes(self::STALE_LOCK_MINUTES));
            });
        if ($tenantId !== null) {
            $q->where('tenant_id', $tenantId);
        }
        // Crash recovery: unlock so cron can resume from cursor (do not fail the job).
        $q->update([
            'locked' => false,
            'locked_at' => null,
            'last_log' => 'Released stale lock; resume from cursor',
        ]);
    }

    public function pause(BulkPriceJob $job): BulkPriceJob
    {
        if (! in_array($job->status, [BulkPriceJob::STATUS_PENDING, BulkPriceJob::STATUS_RUNNING], true)) {
            return $job;
        }
        $job->update([
            'status' => BulkPriceJob::STATUS_PAUSED,
            'locked' => false,
            'locked_at' => null,
            'last_log' => 'Paused by admin',
        ]);

        return $job->fresh();
    }

    public function resume(BulkPriceJob $job): BulkPriceJob
    {
        if ($job->status !== BulkPriceJob::STATUS_PAUSED) {
            return $job;
        }
        if ($this->hasActiveJob($job->tenant_id, $job->id, includePaused: false)) {
            throw new \RuntimeException('Another bulk price job is already running');
        }
        $job->update([
            'status' => BulkPriceJob::STATUS_PENDING,
            'locked' => false,
            'locked_at' => null,
            'last_log' => 'Resumed — waiting for cron',
        ]);

        return $job->fresh();
    }

    public function cancel(BulkPriceJob $job): BulkPriceJob
    {
        if (! $job->isControllable()) {
            return $job;
        }
        $job->update([
            'status' => BulkPriceJob::STATUS_CANCELLED,
            'stage' => BulkPriceJob::STAGE_DONE,
            'locked' => false,
            'locked_at' => null,
            'last_log' => 'Cancelled by admin',
        ]);

        return $job->fresh();
    }

    /** Process due jobs across tenants (cron entrypoint). */
    public function tick(int $batchSize = self::BATCH_SIZE, int $maxBatches = self::MAX_BATCHES_PER_TICK): int
    {
        $processedJobs = 0;
        $ids = BulkPriceJob::query()
            ->whereIn('status', [BulkPriceJob::STATUS_PENDING, BulkPriceJob::STATUS_RUNNING])
            ->orderBy('id')
            ->limit(20)
            ->pluck('id');

        foreach ($ids as $id) {
            $batches = $this->processJobId((int) $id, $batchSize, $maxBatches);
            if ($batches > 0) {
                $processedJobs++;
            }
        }

        return $processedJobs;
    }

    public function processJobId(int $jobId, int $batchSize = self::BATCH_SIZE, int $maxBatches = self::MAX_BATCHES_PER_TICK): int
    {
        $batches = 0;
        for ($i = 0; $i < $maxBatches; $i++) {
            $did = $this->processOneBatch($jobId, $batchSize);
            if (! $did) {
                break;
            }
            $batches++;
            if ($i + 1 < $maxBatches) {
                usleep(self::SLEEP_MS_BETWEEN_BATCHES * 1000);
            }
        }

        return $batches;
    }

    /** @return bool true if a batch was processed (job may still be running) */
    public function processOneBatch(int $jobId, int $batchSize = self::BATCH_SIZE): bool
    {
        $claimed = $this->claimJob($jobId);
        if (! $claimed) {
            return false;
        }

        try {
            $job = BulkPriceJob::query()->find($jobId);
            if (! $job || ! $job->isActive()) {
                $this->releaseLock($jobId);

                return false;
            }

            $params = $this->normalizeParams(is_array($job->params) ? $job->params : []);
            $state = $this->mergeState($job->state, $params['dry_run']);

            if ($job->stage === BulkPriceJob::STAGE_COUNTING || $job->stage === BulkPriceJob::STAGE_PENDING) {
                $total = (clone $this->productQuery($job->tenant_id, $params['filters']))->count();
                $state['total'] = $total;
                $job->update([
                    'status' => BulkPriceJob::STATUS_RUNNING,
                    'stage' => BulkPriceJob::STAGE_APPLYING,
                    'state' => $state,
                    'last_log' => "Counted {$total} products",
                ]);
                $job = $job->fresh();
            }

            $cursor = (int) $job->cursor_product_id;
            $rows = $this->productQuery($job->tenant_id, $params['filters'])
                ->where('id', '>', $cursor)
                ->orderBy('id')
                ->limit($batchSize)
                ->get(['id']);

            if ($rows->isEmpty()) {
                $this->finalize($job, $state);

                return true;
            }

            foreach ($rows as $row) {
                $this->processProduct($job, (int) $row->id, $params, $state);
            }

            $lastId = (int) $rows->last()->id;
            $done = (clone $this->productQuery($job->tenant_id, $params['filters']))
                ->where('id', '>', $lastId)
                ->orderBy('id')
                ->limit(1)
                ->doesntExist();

            // Persist cursor/counters first so pause/cancel mid-tick never loses progress.
            $job->refresh();
            $stillActive = $job->isActive();
            $stage = $done ? BulkPriceJob::STAGE_FINALIZING : BulkPriceJob::STAGE_APPLYING;
            $payload = [
                'cursor_product_id' => $lastId,
                'stage' => $stillActive ? $stage : $job->stage,
                'state' => $state,
                'last_log' => sprintf(
                    'Stage %s · cursor #%d · processed %d/%d · updated %d · skipped %d · failed %d',
                    $stage,
                    $lastId,
                    $state['processed'],
                    $state['total'],
                    $state['updated'],
                    $state['skipped'],
                    $state['failed']
                ),
            ];
            if ($stillActive) {
                $payload['status'] = BulkPriceJob::STATUS_RUNNING;
            }
            $job->update($payload);

            if (! $stillActive) {
                $this->releaseLock($jobId);

                return true;
            }

            if ($done) {
                $this->finalize($job->fresh(), $state);
            } else {
                $this->releaseLock($jobId);
            }

            return true;
        } catch (Throwable $e) {
            BulkPriceJob::query()->whereKey($jobId)->update([
                'status' => BulkPriceJob::STATUS_FAILED,
                'locked' => false,
                'locked_at' => null,
                'last_log' => $e->getMessage(),
            ]);

            return true;
        }
    }

    /**
     * @param  array<string, mixed>  $params
     * @param  array<string, mixed>  $state
     */
    protected function processProduct(BulkPriceJob $job, int $productId, array $params, array &$state): void
    {
        try {
            DB::transaction(function () use ($job, $productId, $params, &$state) {
                /** @var Product|null $product */
                $product = Product::query()->whereKey($productId)->lockForUpdate()->first();
                if (! $product || (string) $product->status === 'trash') {
                    $state['processed']++;
                    $state['skipped']++;

                    return;
                }

                if ($product->lock_price && empty($params['filters']['include_locked'])) {
                    $state['processed']++;
                    $state['skipped']++;
                    $this->recordItem($job->id, $productId, 'skipped', $job->stage, 'Price locked');

                    return;
                }

                $meta = is_array($product->meta) ? $product->meta : [];
                $fields = $params['fields'];
                $signedValue = $params['direction'] === 'decrease' ? -1 * (float) $params['value'] : (float) $params['value'];
                $signature = $this->signature($job->id, $params, $product, $fields, $signedValue);

                if (($meta['bulk_price_applied'] ?? '') === $signature) {
                    $state['processed']++;
                    $state['skipped']++;

                    return;
                }

                $before = [];
                $after = [];
                $updates = [];

                foreach ($fields as $field) {
                    $current = (int) ($product->{$field} ?? 0);
                    if ($field === 'sale_price_minor' && $current <= 0) {
                        continue;
                    }
                    $baseKey = 'bulk_'.$field.'_base';
                    $base = (int) ($meta[$baseKey] ?? 0);
                    if ($base <= 0 && $field === 'price_minor') {
                        $base = (int) ($meta['bulk_price_base_minor'] ?? 0);
                    }
                    if ($base <= 0 && $field === 'sale_price_minor') {
                        $base = (int) ($meta['bulk_sale_base_minor'] ?? 0);
                    }
                    if ($base <= 0) {
                        $base = $current > 0 ? $current : (int) $product->price_minor;
                        $meta[$baseKey] = $base;
                    }
                    $new = $this->computeNew((float) $base, $params['change_type'], $signedValue, $params['rounding'], $params['round_step']);
                    $before[$field] = $current;
                    $after[$field] = $new;
                    $updates[$field] = $new;
                }

                if ($updates === []) {
                    $state['processed']++;
                    $state['skipped']++;
                    $this->recordItem($job->id, $productId, 'skipped', $job->stage, 'No applicable price fields');

                    return;
                }

                $state['processed']++;
                if (! empty($params['dry_run'])) {
                    $state['updated']++;
                    if (count($state['dry_run_sample']) < 20) {
                        $state['dry_run_sample'][] = [
                            'id' => $product->id,
                            'name' => $product->name,
                            'before' => $before,
                            'after' => $after,
                        ];
                    }
                    $this->recordItem($job->id, $productId, 'done', $job->stage, 'dry_run', $before, $after);

                    return;
                }

                // Variants first, then product+signature — one transaction so crash rolls back entirely.
                if (! empty($params['apply_to_variants'])) {
                    $this->applyVariants($product, $params, $signedValue, false);
                }
                $meta['bulk_price_applied'] = $signature;
                $meta['bulk_price_job_id'] = $job->id;
                $updates['meta'] = $meta;
                $updates['price_updated_at'] = now();
                $product->update($updates);
                $state['updated']++;
                $this->recordItem($job->id, $productId, 'done', $job->stage, null, $before, $after);
            });
        } catch (Throwable $e) {
            $state['processed']++;
            $state['failed']++;
            $failures = is_array($state['failures'] ?? null) ? $state['failures'] : [];
            if (count($failures) < 50) {
                $failures[] = ['id' => $productId, 'reason' => $e->getMessage()];
            }
            $state['failures'] = $failures;
            $this->recordItem($job->id, $productId, 'failed', $job->stage, $e->getMessage());
        }
    }

    /**
     * @param  array<string, mixed>  $params
     * @param  list<string>  $fields
     */
    protected function signature(int $jobId, array $params, Product $product, array $fields, float $signedValue): string
    {
        $bases = [];
        $meta = is_array($product->meta) ? $product->meta : [];
        foreach ($fields as $field) {
            $baseKey = 'bulk_'.$field.'_base';
            $base = (int) ($meta[$baseKey] ?? 0);
            if ($base <= 0) {
                $current = (int) ($product->{$field} ?? 0);
                $base = $current > 0 ? $current : (int) $product->price_minor;
            }
            $bases[$field] = $base;
        }
        ksort($bases);

        return 'job:'.$jobId.'|'.$params['change_type'].'|'.$signedValue.'|'.implode(',', $fields).'|'.json_encode($bases);
    }

    protected function computeNew(float $base, string $changeType, float $signedValue, bool $round, int $step): int
    {
        $new = $changeType === 'fixed'
            ? $base + $signedValue
            : $base + ($base * $signedValue / 100);
        if ($round) {
            $new = round($new / max(1, $step)) * max(1, $step);
        }

        return (int) max(0, $new);
    }

    /** @param  array<string, mixed>  $params */
    protected function applyVariants(Product $product, array $params, float $signedValue, bool $dryRun): void
    {
        // Keep inside the product transaction (no chunking) so variants roll back with the product.
        $variants = $product->variants()->orderBy('id')->limit(500)->get();
        foreach ($variants as $variant) {
            if ($variant->lock_price) {
                continue;
            }
            $updates = [];
            foreach ($params['fields'] as $field) {
                $current = (int) ($variant->{$field} ?? 0);
                if ($field === 'sale_price_minor' && $current <= 0) {
                    continue;
                }
                $base = $current > 0 ? $current : (int) $variant->price_minor;
                $updates[$field] = $this->computeNew((float) $base, $params['change_type'], $signedValue, $params['rounding'], $params['round_step']);
            }
            if ($updates !== [] && ! $dryRun) {
                $variant->update($updates);
            }
        }
    }

    /** @param  array<string, mixed>  $state */
    protected function finalize(BulkPriceJob $job, array $state): void
    {
        $job->update([
            'status' => BulkPriceJob::STATUS_DONE,
            'stage' => BulkPriceJob::STAGE_DONE,
            'locked' => false,
            'locked_at' => null,
            'state' => $state,
            'last_log' => sprintf(
                'Finished · updated %d · skipped %d · failed %d%s',
                $state['updated'],
                $state['skipped'],
                $state['failed'],
                ! empty($state['dry_run']) ? ' (dry-run)' : ''
            ),
        ]);
    }

    protected function claimJob(int $jobId): bool
    {
        return DB::transaction(function () use ($jobId) {
            /** @var BulkPriceJob|null $job */
            $job = BulkPriceJob::query()->whereKey($jobId)->lockForUpdate()->first();
            if (! $job || ! $job->isActive()) {
                return false;
            }
            if ($job->locked) {
                if ($job->locked_at && $job->locked_at->gt(now()->subMinutes(self::STALE_LOCK_MINUTES))) {
                    return false;
                }
            }
            $job->update([
                'locked' => true,
                'locked_at' => now(),
                'status' => BulkPriceJob::STATUS_RUNNING,
            ]);

            return true;
        });
    }

    protected function releaseLock(int $jobId): void
    {
        BulkPriceJob::query()->whereKey($jobId)->update([
            'locked' => false,
            'locked_at' => null,
        ]);
    }

    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    protected function recordItem(
        int $jobId,
        int $productId,
        string $status,
        ?string $stage,
        ?string $reason = null,
        ?array $before = null,
        ?array $after = null,
    ): void {
        // Only persist failures + dry-run samples permanently; successes are tracked via cursor + signature.
        if ($status === 'done' && $reason !== 'dry_run') {
            return;
        }
        BulkPriceJobItem::query()->updateOrCreate(
            ['bulk_price_job_id' => $jobId, 'product_id' => $productId],
            [
                'status' => $status,
                'stage' => $stage,
                'reason' => $reason,
                'before' => $before,
                'after' => $after,
            ]
        );
    }

    /** @return array<string, mixed> */
    protected function emptyState(int $total, bool $dryRun): array
    {
        return [
            'processed' => 0,
            'updated' => 0,
            'skipped' => 0,
            'failed' => 0,
            'total' => $total,
            'dry_run' => $dryRun,
            'dry_run_sample' => [],
            'failures' => [],
        ];
    }

    /** @param  array<string, mixed>|null  $state */
    protected function mergeState(?array $state, bool $dryRun): array
    {
        $base = $this->emptyState((int) ($state['total'] ?? 0), $dryRun);

        return array_merge($base, is_array($state) ? $state : []);
    }

    /** @return list<string> */
    protected function normalizeFields(mixed $raw, bool $applyToSaleFallback): array
    {
        $allowed = self::ENABLED_FIELDS;
        if (is_array($raw) && $raw !== []) {
            $out = array_values(array_intersect($allowed, array_map('strval', $raw)));

            return $out !== [] ? $out : ['price_minor'];
        }
        $fields = ['price_minor'];
        if ($applyToSaleFallback) {
            $fields[] = 'sale_price_minor';
        }

        return $fields;
    }

    /** @return array<string, mixed> */
    public function serializeJob(BulkPriceJob $job): array
    {
        return [
            'id' => $job->id,
            'status' => $job->status,
            'stage' => $job->stage,
            'cursor_product_id' => (int) $job->cursor_product_id,
            'locked' => (bool) $job->locked,
            'params' => $job->params,
            'state' => $job->state,
            'last_log' => $job->last_log,
            'created_at' => $job->created_at?->toIso8601String(),
            'updated_at' => $job->updated_at?->toIso8601String(),
        ];
    }

    /** @return array{total:int,locked:int,eligible:int,sample:list<array<string,mixed>>} */
    public function preview(int $tenantId, array $filters): array
    {
        $normalized = $this->normalizeFilters($filters);
        $q = $this->productQuery($tenantId, $normalized);
        // Preview includes locked for counting even when job will skip them.
        $allFilters = $normalized;
        $allFilters['include_locked'] = true;
        $allQ = $this->productQuery($tenantId, $allFilters);
        $total = (clone $allQ)->count();
        $locked = (clone $allQ)->where('lock_price', true)->count();
        $sample = (clone $q)->orderByDesc('id')->limit(8)->get(['id', 'name', 'sku', 'price_minor', 'sale_price_minor', 'stock', 'stock_status', 'lock_price']);

        return [
            'total' => $total,
            'locked' => $locked,
            'eligible' => max(0, $total - ($normalized['include_locked'] ? 0 : $locked)),
            'sample' => $sample->map(fn (Product $p) => [
                'id' => $p->id,
                'name' => $p->name,
                'sku' => $p->sku,
                'price_minor' => (int) $p->price_minor,
                'sale_price_minor' => (int) ($p->sale_price_minor ?? 0),
                'stock' => $p->stock,
                'stock_status' => $p->stock_status,
                'lock_price' => (bool) $p->lock_price,
            ])->all(),
        ];
    }
}
