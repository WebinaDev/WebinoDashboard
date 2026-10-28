<?php

namespace App\Console\Commands;

use App\Models\WordpressImportJob;
use App\Services\WordpressImport\WordpressImportReconciler;
use Illuminate\Console\Command;

class ReconcileWordpressImportCommand extends Command
{
    protected $signature = 'wordpress-import:reconcile
        {job : Import job id}
        {--source= : WooCommerce export JSON file or directory (default: the job\'s own product items)}
        {--import : Re-queue the missing products and run the import}
        {--json : Print the report as JSON}
        {--limit=50 : Records per batch when importing}';

    protected $description = 'List source products that were not imported (with the reason) and optionally re-import them';

    public function handle(WordpressImportReconciler $reconciler): int
    {
        $job = WordpressImportJob::query()->find($this->argument('job'));
        if (! $job) {
            $this->error('Import job was not found.');

            return self::FAILURE;
        }
        $source = null;
        if ($path = $this->option('source')) {
            try {
                $source = $reconciler->loadSource((string) $path);
            } catch (\InvalidArgumentException $e) {
                $this->error($e->getMessage());

                return self::FAILURE;
            }
        }
        $report = $reconciler->report($job, $source);
        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        } else {
            $this->info("Source products: {$report['source']}, imported: {$report['imported']}, missing: ".count($report['missing']));
            if ($report['missing'] !== []) {
                $this->table(['Source ID', 'Name', 'Reason'], array_map(fn ($m) => [$m['external_id'], $m['name'], $m['reason']], $report['missing']));
            }
        }
        if (! $this->option('import') || $report['missing'] === []) {
            return self::SUCCESS;
        }
        $queued = $reconciler->requeue($job, $report['missing'], $source);
        $this->info("Re-queued {$queued} product(s).");

        return $this->call('wordpress-import:run', ['job' => $job->id, '--limit' => $this->option('limit')]);
    }
}
