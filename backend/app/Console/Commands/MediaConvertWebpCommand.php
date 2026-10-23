<?php

namespace App\Console\Commands;

use App\Models\MediaAsset;
use App\Services\Media\WebpConverter;
use Illuminate\Console\Command;

class MediaConvertWebpCommand extends Command
{
    protected $signature = 'media:convert-webp
        {--dry-run : List what would be converted without writing anything}
        {--tenant= : Only convert assets of this tenant id}
        {--chunk=100 : Rows per batch}';

    protected $description = 'Backfill WebP versions for existing JPEG/PNG/GIF media (idempotent; originals are kept)';

    public function handle(WebpConverter $converter): int
    {
        if (! WebpConverter::supported()) {
            $this->error('GD with WebP support is not available in this PHP build.');

            return self::FAILURE;
        }
        $dry = (bool) $this->option('dry-run');
        $q = MediaAsset::query()
            ->whereNull('original_path')
            ->whereIn('mime', WebpConverter::CONVERTIBLE);
        if ($this->option('tenant') !== null) {
            $q->where('tenant_id', (int) $this->option('tenant'));
        }

        $done = 0;
        $skipped = 0;
        $q->orderBy('id')->chunkById(max(1, (int) $this->option('chunk')), function ($rows) use ($converter, $dry, &$done, &$skipped) {
            foreach ($rows as $asset) {
                $ok = $converter->applyToAsset($asset, $dry);
                $ok ? $done++ : $skipped++;
                if ($ok && $this->getOutput()->isVerbose()) {
                    $this->line(($dry ? '[dry] ' : '').'#'.$asset->id.' '.$asset->path);
                }
            }
        });

        $this->info(($dry ? 'Would convert' : 'Converted').": {$done}; skipped: {$skipped}");

        return self::SUCCESS;
    }
}
