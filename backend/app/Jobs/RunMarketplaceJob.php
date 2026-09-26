<?php

namespace App\Jobs;

use App\Models\MarketplaceJob;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSync;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Executes one marketplace_jobs row. Retries with backoff min(3600, 2^n·30).
 */
class RunMarketplaceJob implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public int $timeout = 300;

    public function __construct(public int $jobId) {}

    public function uniqueId(): string
    {
        return (string) $this->jobId;
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return array_map(fn ($n) => min(3600, (2 ** $n) * 30), range(0, $this->tries - 1));
    }

    public function handle(MarketplaceSync $sync): void
    {
        $row = MarketplaceJob::query()->find($this->jobId);
        if (! $row || in_array($row->status, ['done', 'cancelled'], true)) {
            return;
        }

        $row->update([
            'status' => 'running',
            'attempts' => $row->attempts + 1,
            'started_at' => now(),
        ]);

        try {
            $result = $sync->execute($row);
            $row->update([
                'status' => 'done',
                'last_error' => null,
                'finished_at' => now(),
                'payload' => array_merge($row->payload ?? [], ['result' => $result]),
            ]);
        } catch (Throwable $e) {
            $maxTries = (int) (($row->payload['_max_attempts'] ?? null) ?: $this->tries);
            $retryable = ! ($e instanceof MarketplaceException) || $e->isTransient();
            $final = ! $retryable || $row->attempts >= $maxTries;
            $row->update([
                'status' => $final ? 'failed' : 'retrying',
                'last_error' => mb_substr($e->getMessage(), 0, 2000),
                'finished_at' => $final ? now() : null,
            ]);
            MarketplaceLogger::error($row->tenant_id, $row->platform, 'jobs', $row->job_type.': '.$e->getMessage(), ['job_id' => $row->id]);
            if (! $final) {
                $delay = $e instanceof MarketplaceException && $e->retryAfter > 0
                    ? $e->retryAfter
                    : min(3600, (2 ** max(0, $row->attempts - 1)) * 30);
                $this->release($delay);
            }
        }
    }
}
