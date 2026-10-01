<?php

namespace App\Services\WordpressImport;

use App\Models\Order;
use App\Models\User;
use App\Models\WordpressImportItem;
use App\Models\WordpressImportJob;
use App\Models\WordpressImportLink;
use App\Services\Reports\OrderReports;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

final class WordpressImportRunner
{
    public function __construct(
        private readonly WordpressImportImporter $importer,
        private readonly WordpressImportMapper $mapper,
        private readonly RemoteAssetFetcher $fetcher,
    ) {}

    /**
     * @param  array<string, list<array<string, mixed>>>  $bundles
     * @return array{accepted: int, updated: int}
     */
    public function enqueue(WordpressImportJob $job, array $bundles): array
    {
        $accepted = 0;
        $updated = 0;
        foreach ($bundles as $resource => $rows) {
            $resource = WordpressImportResources::canonical((string) $resource);
            foreach ($rows as $row) {
                $externalId = mb_substr(trim((string) ($row['external_id'] ?? '')), 0, 191);
                if ($externalId === '') {
                    throw new InvalidArgumentException('Every record needs external_id.');
                }
                $item = WordpressImportItem::query()->updateOrCreate(
                    [
                        'job_id' => $job->id,
                        'resource' => $resource,
                        'external_id' => $externalId,
                    ],
                    [
                        'tenant_id' => $job->tenant_id,
                        'payload' => $row,
                        'status' => 'pending',
                        'action' => null,
                        'message' => null,
                    ]
                );
                $item->wasRecentlyCreated ? $accepted++ : $updated++;
            }
        }
        if (in_array($job->status, ['completed', 'completed_with_errors', 'failed'], true)) {
            $job->status = 'ready';
            $job->finished_at = null;
            $job->save();
        }
        $this->refreshProgress($job);

        return ['accepted' => $accepted, 'updated' => $updated];
    }

    public function tick(WordpressImportJob $job, int $limit): WordpressImportJob
    {
        $limit = max(1, min(100, $limit));
        if ($job->status === 'paused') {
            throw new InvalidArgumentException('Import is paused.');
        }
        $job->status = 'running';
        $job->started_at ??= now();
        $job->last_error = null;
        $job->save();

        $this->skipUnselected($job);
        $processed = 0;
        try {
            while ($processed < $limit) {
                $job->refresh();
                if ($job->status === 'paused') {
                    break;
                }
                $item = $this->nextItem($job);
                if (! $item) {
                    break;
                }
                $this->process($job, $item);
                $processed++;
            }
            $this->importer->fixCategoryParents(new ImportContext($job, $this->mapper, $this->fetcher));
            $this->relinkOrders($job);
        } catch (Throwable $e) {
            $job->last_error = mb_substr($e->getMessage(), 0, 2000);
            $job->status = 'failed';
            $job->save();
            $this->refreshProgress($job);

            return $job->fresh() ?? $job;
        }

        $this->refreshProgress($job);
        $job->refresh();
        if ($job->status === 'paused') {
            return $job;
        }
        $pending = $job->items()->where('status', 'pending')->count();
        $failed = $job->items()->where('status', 'failed')->count();
        if ($pending === 0) {
            $job->status = $failed > 0 ? 'completed_with_errors' : 'completed';
            $job->finished_at = now();
        } else {
            $job->status = 'ready';
        }
        $job->save();

        return $job->fresh() ?? $job;
    }

    public function retryFailed(WordpressImportJob $job): int
    {
        $count = $job->items()->where('status', 'failed')->update([
            'status' => 'pending',
            'action' => null,
            'message' => null,
        ]);
        if ($count > 0) {
            $job->status = 'ready';
            $job->finished_at = null;
            $job->save();
        }
        $this->refreshProgress($job);

        return $count;
    }

    /** @return array<string, mixed> */
    public function stats(WordpressImportJob $job): array
    {
        $externalIds = $job->items()->where('resource', 'orders')->where('status', 'done')->pluck('external_id');
        $orders = collect();
        if ($externalIds->isNotEmpty()) {
            $localIds = WordpressImportLink::query()
                ->where('tenant_id', $job->tenant_id)
                ->where('resource', 'orders')
                ->whereIn('external_id', $externalIds)
                ->pluck('local_id');
            if ($localIds->isNotEmpty()) {
                $orders = Order::query()
                    ->where('tenant_id', $job->tenant_id)
                    ->whereIn('id', $localIds)
                    ->get(['id', 'status', 'total_minor', 'created_at']);
            }
        }
        $sales = OrderReports::salesStatuses();
        $byPeriod = [];
        $revenue = 0;
        $salesCount = 0;
        foreach ($orders as $order) {
            $period = optional($order->created_at)->format('Y-m') ?: 'unknown';
            $byPeriod[$period] ??= ['period' => $period, 'orders' => 0, 'revenue_minor' => 0];
            $byPeriod[$period]['orders']++;
            if (in_array((string) $order->status, $sales, true)) {
                $salesCount++;
                $revenue += (int) $order->total_minor;
                $byPeriod[$period]['revenue_minor'] += (int) $order->total_minor;
            }
        }
        ksort($byPeriod);
        $summary = is_array($job->summary) ? $job->summary : [];

        return [
            'orders' => $orders->count(),
            'sales_orders' => $salesCount,
            'revenue_minor' => $revenue,
            'by_period' => array_values($byPeriod),
            'snapshots' => array_values(is_array($summary['snapshots'] ?? null) ? $summary['snapshots'] : []),
        ];
    }

    public function refreshProgress(WordpressImportJob $job): void
    {
        $rows = $job->items()
            ->select(['resource', 'status', 'action'])
            ->selectRaw('count(*) as aggregate')
            ->groupBy('resource', 'status', 'action')
            ->get();
        $byResource = [];
        $totals = ['pending' => 0, 'done' => 0, 'failed' => 0, 'skipped' => 0];
        foreach ($rows as $row) {
            $resource = (string) $row->resource;
            $status = (string) $row->status;
            $byResource[$resource] ??= ['pending' => 0, 'done' => 0, 'failed' => 0, 'skipped' => 0, 'created' => 0, 'updated' => 0];
            $count = (int) $row->aggregate;
            if (isset($byResource[$resource][$status])) {
                $byResource[$resource][$status] += $count;
            }
            if (isset($totals[$status])) {
                $totals[$status] += $count;
            }
            $action = (string) $row->action;
            if (in_array($action, ['created', 'updated', 'would_create', 'would_update'], true)) {
                $bucket = str_contains($action, 'update') ? 'updated' : 'created';
                $byResource[$resource][$bucket] += $count;
            }
        }
        $errors = $job->items()->where('status', 'failed')->orderByDesc('id')->limit(50)->get()
            ->map(fn (WordpressImportItem $item) => [
                'id' => $item->id,
                'resource' => $item->resource,
                'external_id' => $item->external_id,
                'message' => $item->message,
            ])->values()->all();
        $done = $totals['done'] + $totals['failed'] + $totals['skipped'];
        $all = $done + $totals['pending'];
        $job->progress = [
            'totals' => $totals,
            'by_resource' => $byResource,
            'errors' => $errors,
            'percent' => $all > 0 ? (int) round(($done / $all) * 100) : 0,
        ];
        $job->save();
    }

    private function process(WordpressImportJob $job, WordpressImportItem $item): void
    {
        try {
            $outcome = DB::transaction(function () use ($job, $item) {
                return $this->importer->import(
                    new ImportContext($job, $this->mapper, $this->fetcher),
                    $item->resource,
                    is_array($item->payload) ? $item->payload : []
                );
            });
            $item->status = 'done';
            $item->action = $outcome->action;
            $item->message = $outcome->message;
            $item->save();
        } catch (Throwable $e) {
            $item->status = 'failed';
            $item->action = 'failed';
            $item->message = mb_substr($e->getMessage(), 0, 2000);
            $item->save();
        }
    }

    private function nextItem(WordpressImportJob $job): ?WordpressImportItem
    {
        foreach (WordpressImportResources::ALL as $resource) {
            $item = $job->items()
                ->where('resource', $resource)
                ->where('status', 'pending')
                ->orderBy('id')
                ->first();
            if ($item) {
                return $item;
            }
        }

        return null;
    }

    private function skipUnselected(WordpressImportJob $job): void
    {
        $selected = $job->options['resources'] ?? null;
        if (! is_array($selected) || $selected === []) {
            return;
        }
        $job->items()
            ->where('status', 'pending')
            ->whereNotIn('resource', $selected)
            ->update([
                'status' => 'skipped',
                'action' => 'skipped',
                'message' => 'Resource was not selected for this job.',
            ]);
    }

    private function relinkOrders(WordpressImportJob $job): void
    {
        if ($job->dry_run) {
            return;
        }
        $items = $job->items()->where('resource', 'orders')->where('status', 'done')->get();
        foreach ($items as $item) {
            $payload = is_array($item->payload) ? $item->payload : [];
            $customerExternal = trim((string) ($payload['customer_external_id'] ?? ''));
            if ($customerExternal === '') {
                continue;
            }
            $customer = WordpressImportLink::query()
                ->where('tenant_id', $job->tenant_id)
                ->where('resource', 'customers')
                ->where('external_id', $customerExternal)
                ->first();
            $orderLink = WordpressImportLink::query()
                ->where('tenant_id', $job->tenant_id)
                ->where('resource', 'orders')
                ->where('external_id', $item->external_id)
                ->first();
            if (! $customer || ! $orderLink || $customer->local_type !== User::class) {
                continue;
            }
            Order::query()
                ->where('tenant_id', $job->tenant_id)
                ->whereKey($orderLink->local_id)
                ->whereNull('user_id')
                ->update(['user_id' => $customer->local_id]);
        }
    }
}
