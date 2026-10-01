<?php

namespace App\Console\Commands;

use App\Models\WordpressImportJob;
use App\Services\WordpressImport\WordpressImportRunner;
use Illuminate\Console\Command;
use InvalidArgumentException;

class RunWordpressImportCommand extends Command
{
    protected $signature = 'wordpress-import:run {job : Import job id} {--limit=50 : Records per batch}';

    protected $description = 'Run a WordPress import job until it finishes, pauses, or fails';

    public function handle(WordpressImportRunner $runner): int
    {
        $job = WordpressImportJob::query()->find($this->argument('job'));
        if (! $job) {
            $this->error('Import job was not found.');

            return self::FAILURE;
        }
        $limit = max(1, (int) $this->option('limit'));
        if ($job->status === 'paused') {
            $job->status = 'ready';
            $job->save();
        }
        do {
            try {
                $job = $runner->tick($job, $limit);
            } catch (InvalidArgumentException $e) {
                $this->error($e->getMessage());

                return self::FAILURE;
            }
            $totals = is_array($job->progress) ? ($job->progress['totals'] ?? []) : [];
            $this->line($job->status.' '.json_encode($totals));
        } while (in_array($job->status, ['ready', 'running'], true));

        return $job->status === 'failed' ? self::FAILURE : self::SUCCESS;
    }
}
