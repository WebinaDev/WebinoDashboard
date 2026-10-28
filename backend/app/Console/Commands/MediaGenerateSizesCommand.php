<?php

namespace App\Console\Commands;

use App\Models\MediaAsset;
use App\Services\Media\ImageSizes;
use Illuminate\Console\Command;

class MediaGenerateSizesCommand extends Command
{
    protected $signature = 'media:generate-sizes
        {--tenant= : Only this tenant id}
        {--dry-run : Count candidates without writing}
        {--force : Regenerate existing card sizes}
        {--chunk=100 : Rows per batch}';

    protected $description = 'Backfill the ~800px WebP card size (name-800w.webp) for existing raster media (idempotent)';

    public function handle(ImageSizes $sizes): int
    {
        $q = MediaAsset::query()->where('mime', 'like', 'image/%')->where('mime', '!=', 'image/svg+xml');
        if ($this->option('tenant') !== null) {
            $q->where('tenant_id', (int) $this->option('tenant'));
        }
        $made = 0;
        $skipped = 0;
        $dry = (bool) $this->option('dry-run');
        $q->orderBy('id')->chunkById(max(1, (int) $this->option('chunk')), function ($rows) use ($sizes, $dry, &$made, &$skipped) {
            foreach ($rows as $asset) {
                if (! $asset->path || ImageSizes::isCardPath($asset->path)) {
                    $skipped++;

                    continue;
                }
                if ($dry) {
                    $made++;

                    continue;
                }
                $sizes->generate((string) ($asset->disk ?: 'public'), $asset->path, (bool) $this->option('force')) ? $made++ : $skipped++;
            }
        });
        $this->info(($dry ? 'Would process' : 'Card sizes ready').": {$made}; skipped (small/non-raster/missing): {$skipped}");

        return self::SUCCESS;
    }
}
