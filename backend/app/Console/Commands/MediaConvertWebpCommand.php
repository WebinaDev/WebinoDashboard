<?php

namespace App\Console\Commands;

use App\Models\MediaAsset;
use App\Services\Media\MediaLinkRepointer;
use App\Services\Media\WebpConverter;
use Illuminate\Console\Command;

class MediaConvertWebpCommand extends Command
{
    protected $signature = 'media:convert-webp
        {--dry-run : List what would be converted without writing anything}
        {--tenant= : Only convert assets of this tenant id}
        {--chunk=100 : Rows per batch}
        {--no-repoint : Keep stored links on the original files}
        {--repoint-only : Only repoint links of assets converted earlier}';

    protected $description = 'Backfill WebP versions for existing JPEG/PNG/GIF media and repoint stored links to them (idempotent; originals are kept)';

    public function handle(WebpConverter $converter, MediaLinkRepointer $repointer): int
    {
        $repoint = ! $this->option('no-repoint');
        if ($this->option('repoint-only')) {
            return $this->repointExisting($repointer, (bool) $this->option('dry-run'));
        }
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
        $links = 0;
        $q->orderBy('id')->chunkById(max(1, (int) $this->option('chunk')), function ($rows) use ($converter, $repointer, $repoint, $dry, &$done, &$skipped, &$links) {
            foreach ($rows as $asset) {
                $before = (string) $asset->path;
                $ok = $converter->applyToAsset($asset, $dry);
                if ($ok && $repoint && ! $dry) {
                    $links += $repointer->repoint((int) $asset->tenant_id, $before, (string) $asset->path);
                }
                $ok ? $done++ : $skipped++;
                if ($ok && $this->getOutput()->isVerbose()) {
                    $this->line(($dry ? '[dry] ' : '').'#'.$asset->id.' '.$asset->path);
                }
            }
        });

        $this->info(($dry ? 'Would convert' : 'Converted').": {$done}; skipped: {$skipped}".($repoint && ! $dry ? "; links repointed: {$links}" : ''));

        return self::SUCCESS;
    }

    /** Assets converted before repointing existed: original_path set, links may still use it. */
    private function repointExisting(MediaLinkRepointer $repointer, bool $dry): int
    {
        $q = \App\Models\MediaAsset::query()->whereNotNull('original_path')->where('mime', 'image/webp');
        if ($this->option('tenant') !== null) {
            $q->where('tenant_id', (int) $this->option('tenant'));
        }
        $links = 0;
        $q->orderBy('id')->chunkById(max(1, (int) $this->option('chunk')), function ($rows) use ($repointer, $dry, &$links) {
            foreach ($rows as $asset) {
                $links += $repointer->repoint((int) $asset->tenant_id, (string) $asset->original_path, (string) $asset->path, $dry);
            }
        });
        $this->info(($dry ? 'Would repoint' : 'Repointed').": {$links} rows");

        return self::SUCCESS;
    }
}
