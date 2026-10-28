<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Models\Tenant;
use App\Services\Seo\SeoRedirectService;
use App\Services\Seo\SeoSettingsService;
use Illuminate\Console\Command;

/**
 * Verify every old WooCommerce product URL still lands on its product after migration.
 * Source of truth is the export's `all_product_slugs` (+ products.json permalinks), NOT the WP sitemap
 * (sitemaps routinely omit products — parisma misses 46).
 */
class CheckWpPermalinksCommand extends Command
{
    protected $signature = 'webino:check-wp-permalinks
        {export : Directory containing summary.json and products.json}
        {--tenant= : Tenant id (default: first tenant)}
        {--json : Print machine-readable result}';

    protected $description = 'Check old WP product URLs resolve (root slug or 301) to migrated products';

    public function handle(SeoSettingsService $seo, SeoRedirectService $redirects): int
    {
        $dir = rtrim((string) $this->argument('export'), '/');
        $summary = json_decode((string) @file_get_contents($dir.'/summary.json'), true);
        $products = json_decode((string) @file_get_contents($dir.'/products.json'), true);
        if (! is_array($summary) || ! is_array($summary['all_product_slugs'] ?? null)) {
            $this->error('summary.json with all_product_slugs not found in '.$dir);

            return self::FAILURE;
        }
        $tenant = $this->option('tenant')
            ? Tenant::query()->find((int) $this->option('tenant'))
            : Tenant::query()->orderBy('id')->first();
        if (! $tenant) {
            $this->error('Tenant not found');

            return self::FAILURE;
        }
        $tid = (int) $tenant->id;

        $paths = [];
        foreach ($summary['all_product_slugs'] as $slug) {
            $slug = rawurldecode((string) $slug);
            $paths[$slug] = '/'.$slug.'/';
        }
        foreach (is_array($products) ? $products : [] as $p) {
            $slug = rawurldecode((string) ($p['slug'] ?? ''));
            $path = parse_url((string) ($p['permalink'] ?? ''), PHP_URL_PATH);
            if ($slug !== '' && is_string($path) && $path !== '') {
                $paths[$slug] = rawurldecode($path);
            }
        }

        $cfg = $seo->get($tid);
        $rootMode = ($cfg['product_permalink_base'] ?? 'product') === '';
        $existing = Product::query()->where('tenant_id', $tid)
            ->whereIn('slug', array_keys($paths))->pluck('slug')->flip();

        $ok = 0;
        $fail = [];
        foreach ($paths as $slug => $oldPath) {
            if (! isset($existing[$slug])) {
                $fail[] = ['slug' => $slug, 'old' => $oldPath, 'reason' => 'product_missing'];

                continue;
            }
            $canonical = SeoSettingsService::productPathFor($cfg, $slug);
            $bare = '/'.trim($oldPath, '/');
            if ($rootMode && $bare === $canonical) {
                $ok++;

                continue;
            }
            $hit = $redirects->find($tid, $oldPath);
            $to = $hit ? rawurldecode((string) parse_url((string) $hit->to_path, PHP_URL_PATH)) : null;
            if ($to !== null && '/'.trim($to, '/') === $canonical) {
                $ok++;
            } elseif ($hit) {
                $fail[] = ['slug' => $slug, 'old' => $oldPath, 'reason' => 'redirect_wrong_target:'.$to];
            } else {
                $fail[] = ['slug' => $slug, 'old' => $oldPath, 'reason' => $rootMode ? 'unresolved' : 'no_redirect (set product_permalink_base="" or import redirects)'];
            }
        }

        $result = ['tenant' => $tid, 'root_mode' => $rootMode, 'total' => count($paths), 'ok' => $ok, 'failed' => $fail];
        if ($this->option('json')) {
            $this->line(json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        } else {
            $this->info("Tenant {$tid} · root_mode=".($rootMode ? 'yes' : 'no')." · {$ok}/".count($paths).' OK');
            if ($fail) {
                $this->table(['slug', 'old', 'reason'], $fail);
            }
        }

        return $fail ? self::FAILURE : self::SUCCESS;
    }
}
