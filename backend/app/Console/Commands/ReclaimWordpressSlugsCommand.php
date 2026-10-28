<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Models\SeoRedirect;
use App\Models\WordpressImportItem;
use App\Models\WordpressImportJob;
use App\Models\WordpressImportLink;
use App\Services\Seo\SeoRedirectService;
use Illuminate\Console\Command;

/**
 * Products imported while their WordPress slug was taken got a "-2" suffix. Once the clean
 * slug is free again the WordPress permalink (/clean-slug) soft-404s and the product page
 * only shows the site name as title. This renames such products back to their source slug
 * and adds a 301 from the suffixed path.
 */
class ReclaimWordpressSlugsCommand extends Command
{
    protected $signature = 'wordpress-import:reclaim-slugs {job : Import job id} {--dry-run : Only list the changes}';

    protected $description = 'Rename imported products back to their WordPress slug when it is free (fixes "-2" suffixed slugs)';

    public function handle(SeoRedirectService $redirects): int
    {
        $job = WordpressImportJob::query()->find($this->argument('job'));
        if (! $job) {
            $this->error('Import job was not found.');

            return self::FAILURE;
        }
        $tenant = (int) $job->tenant_id;
        $links = WordpressImportLink::query()->where('tenant_id', $tenant)->where('resource', 'products')->pluck('local_id', 'external_id');
        $rows = [];
        WordpressImportItem::query()->where('job_id', $job->id)->where('resource', 'products')
            ->get(['external_id', 'payload'])->each(function ($item) use (&$rows, $links) {
                $slug = rawurldecode(trim((string) (((array) $item->payload)['slug'] ?? '')));
                $local = $links[$item->external_id] ?? null;
                if ($slug !== '' && $local) {
                    $rows[] = [(int) $local, mb_strtolower($slug)];
                }
            });
        $changed = 0;
        foreach ($rows as [$id, $wanted]) {
            $product = Product::query()->where('tenant_id', $tenant)->find($id);
            if (! $product || $product->slug === $wanted || ! str_starts_with((string) $product->slug, $wanted.'-')) {
                continue;
            }
            if (Product::query()->where('tenant_id', $tenant)->where('slug', $wanted)->whereKeyNot($id)->exists()) {
                continue;
            }
            $old = (string) $product->slug;
            $this->line("{$old} -> {$wanted}");
            $changed++;
            if ($this->option('dry-run')) {
                continue;
            }
            $product->slug = $wanted;
            $product->save();
            // A redirect away from the reclaimed path would now shadow the product.
            SeoRedirect::query()->where('tenant_id', $tenant)->whereIn('from_path', ['/'.$wanted, '/product/'.$wanted])->delete();
            foreach (['/'.$old, '/product/'.$old] as $from) {
                try {
                    $redirects->upsert($tenant, ['from_path' => $from, 'to_path' => '/'.$wanted, 'status_code' => 301, 'note' => 'wordpress slug reclaimed']);
                } catch (\Throwable) {
                    // keep going
                }
            }
        }
        $this->info(($this->option('dry-run') ? 'Would rename ' : 'Renamed ')."{$changed} product(s).");

        return self::SUCCESS;
    }
}
