<?php

namespace App\Console\Commands;

use App\Models\WordpressImportJob;
use App\Services\WordpressImport\WordpressImportRunner;
use Illuminate\Console\Command;

class ResetWordpressImportCommand extends Command
{
    protected $signature = 'wordpress-import:reset
        {job? : Import job id (omit with --stale)}
        {--stale : Mark every running job without a recent heartbeat as failed (resumable)}
        {--retry-failed : Also move failed items back to pending}';

    protected $description = 'Unstick a WordPress import job (stale "running") so it can be resumed';

    public function handle(WordpressImportRunner $runner): int
    {
        if ($this->option('stale') && $this->argument('job') === null) {
            $count = $runner->recoverStaleJobs();
            $this->info("Marked {$count} stale import job(s) as failed. Run wordpress-import:run <job> to resume.");

            return self::SUCCESS;
        }
        $job = WordpressImportJob::query()->find($this->argument('job'));
        if (! $job) {
            $this->error('Import job was not found.');

            return self::FAILURE;
        }
        $before = $job->status;
        $retried = $runner->reset($job, (bool) $this->option('retry-failed'));
        $pending = $job->items()->where('status', 'pending')->count();
        $this->info("Job #{$job->id}: {$before} -> ready; {$pending} pending item(s)".($retried ? ", {$retried} failed item(s) re-queued" : '').'.');

        return self::SUCCESS;
    }
}
