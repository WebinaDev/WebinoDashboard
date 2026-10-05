<?php

namespace App\Services\Seo;

use App\Models\BlogPost;
use App\Models\CmsPage;
use App\Models\Product;
use App\Models\Tenant;
use Carbon\Carbon;

final class SitemapBuilder
{
    public function __construct(protected SeoSettingsService $settings) {}

    public function indexXml(Tenant $tenant): string
    {
        $cfg = $this->settings->get((int) $tenant->id);
        if (empty($cfg['sitemap_enabled'])) {
            return $this->emptyUrlset();
        }
        $base = $this->base($tenant);
        $now = Carbon::now()->toAtomString();
        $maps = ['sitemap-pages.xml', 'sitemap-products.xml', 'sitemap-posts.xml'];
        if (! empty($cfg['sitemap_include_news'])) {
            $maps[] = 'sitemap-news.xml';
        }
        if (! empty($cfg['sitemap_include_videos'])) {
            $maps[] = 'sitemap-video.xml';
        }
        $body = '';
        foreach ($maps as $map) {
            $body .= '  <sitemap><loc>'.e($base.'/'.$map).'</loc><lastmod>'.$now.'</lastmod></sitemap>'."\n";
        }

        return '<?xml version="1.0" encoding="UTF-8"?>'."\n"
            .'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n"
            .$body
            .'</sitemapindex>';
    }

    public function pagesXml(Tenant $tenant): string
    {
        $cfg = $this->settings->get((int) $tenant->id);
        if (empty($cfg['sitemap_enabled']) || empty($cfg['sitemap_include_pages'])) {
            return $this->emptyUrlset();
        }
        $base = $this->base($tenant);
        $urls = [['loc' => $base.'/', 'lastmod' => Carbon::now()->toAtomString()]];
        if (class_exists(CmsPage::class)) {
            CmsPage::query()
                ->where('tenant_id', $tenant->id)
                ->where(function ($q) { $q->where('published', true)->orWhere('status', 'publish'); })
                ->orderBy('id')
                ->limit(5000)
                ->get(['slug', 'updated_at'])
                ->each(function ($page) use (&$urls, $base) {
                    $slug = ltrim((string) $page->slug, '/');
                    if ($slug === '' || $slug === 'home') {
                        return;
                    }
                    $urls[] = [
                        'loc' => $base.'/'.$slug,
                        'lastmod' => optional($page->updated_at)?->toAtomString() ?? Carbon::now()->toAtomString(),
                    ];
                });
        }

        return $this->urlset($urls);
    }

    public function productsXml(Tenant $tenant): string
    {
        $cfg = $this->settings->get((int) $tenant->id);
        if (empty($cfg['sitemap_enabled']) || empty($cfg['sitemap_include_products'])) {
            return $this->emptyUrlset();
        }
        $base = $this->base($tenant);
        $urls = [];
        Product::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'publish')
            ->where(function ($q) {
                $q->whereNull('catalog_visibility')->orWhere('catalog_visibility', '!=', 'hidden');
            })
            ->orderBy('id')
            ->limit(20000)
            ->get(['slug', 'updated_at'])
            ->each(function ($p) use (&$urls, $base) {
                $urls[] = [
                    'loc' => $base.'/product/'.$p->slug,
                    'lastmod' => optional($p->updated_at)?->toAtomString() ?? Carbon::now()->toAtomString(),
                ];
            });

        return $this->urlset($urls);
    }

    public function postsXml(Tenant $tenant): string
    {
        $cfg = $this->settings->get((int) $tenant->id);
        if (empty($cfg['sitemap_enabled']) || empty($cfg['sitemap_include_posts'])) {
            return $this->emptyUrlset();
        }
        $base = $this->base($tenant);
        $urls = [];
        BlogPost::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'publish')
            ->orderByDesc('published_at')
            ->limit(10000)
            ->get(['slug', 'updated_at', 'published_at'])
            ->each(function ($p) use (&$urls, $base) {
                $urls[] = [
                    'loc' => $base.'/blog/'.$p->slug,
                    'lastmod' => optional($p->updated_at ?? $p->published_at)?->toAtomString() ?? Carbon::now()->toAtomString(),
                ];
            });

        return $this->urlset($urls);
    }

    public function newsXml(Tenant $tenant): string
    {
        $cfg = $this->settings->get((int) $tenant->id);
        if (empty($cfg['sitemap_enabled']) || empty($cfg['sitemap_include_news'])) {
            return $this->emptyUrlset();
        }
        $base = $this->base($tenant);
        $pub = (string) ($cfg['news_publication_name'] ?: ($tenant->store_display_name ?: $tenant->name));
        $lang = (string) ($cfg['news_language'] ?: 'fa');
        $items = BlogPost::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'publish')
            ->where('published_at', '>=', Carbon::now()->subDays(2))
            ->orderByDesc('published_at')
            ->limit(1000)
            ->get(['slug', 'title', 'published_at']);

        $body = '';
        foreach ($items as $p) {
            $loc = e($base.'/blog/'.$p->slug);
            $title = e((string) $p->title);
            $date = optional($p->published_at)?->toAtomString() ?? Carbon::now()->toAtomString();
            $body .= "  <url>\n    <loc>{$loc}</loc>\n"
                ."    <news:news>\n"
                ."      <news:publication><news:name>".e($pub)."</news:name><news:language>".e($lang)."</news:language></news:publication>\n"
                ."      <news:publication_date>{$date}</news:publication_date>\n"
                ."      <news:title>{$title}</news:title>\n"
                ."    </news:news>\n"
                ."  </url>\n";
        }

        return '<?xml version="1.0" encoding="UTF-8"?>'."\n"
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'."\n"
            .$body
            .'</urlset>';
    }

    public function videoXml(Tenant $tenant): string
    {
        $cfg = $this->settings->get((int) $tenant->id);
        if (empty($cfg['sitemap_enabled']) || empty($cfg['sitemap_include_videos'])) {
            return $this->emptyUrlset();
        }
        $base = $this->base($tenant);
        // Pull products/posts that declare a video URL in meta/seo.
        $body = '';
        Product::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'publish')
            ->orderBy('id')
            ->limit(5000)
            ->get(['slug', 'name', 'meta', 'updated_at'])
            ->each(function ($p) use (&$body, $base) {
                $meta = is_array($p->meta) ? $p->meta : [];
                $video = (string) ($meta['video_url'] ?? $meta['seo_video_url'] ?? '');
                if ($video === '') {
                    return;
                }
                $loc = e($base.'/product/'.$p->slug);
                $body .= "  <url>\n    <loc>{$loc}</loc>\n"
                    ."    <video:video>\n"
                    .'      <video:thumbnail_loc>'.e((string) ($meta['seo_og_image'] ?? $meta['image_url'] ?? $loc))."</video:thumbnail_loc>\n"
                    .'      <video:title>'.e((string) $p->name)."</video:title>\n"
                    .'      <video:description>'.e(mb_substr((string) ($meta['seo_description'] ?? $p->name), 0, 200))."</video:description>\n"
                    .'      <video:content_loc>'.e($video)."</video:content_loc>\n"
                    ."    </video:video>\n"
                    ."  </url>\n";
            });

        return '<?xml version="1.0" encoding="UTF-8"?>'."\n"
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">'."\n"
            .$body
            .'</urlset>';
    }

    public function robotsTxt(Tenant $tenant): string
    {
        $cfg = $this->settings->get((int) $tenant->id);
        $base = $this->base($tenant);
        $lines = [
            'User-agent: *',
            'Allow: /',
            'Disallow: /dashboard',
            'Disallow: /login',
            'Disallow: /setup',
            'Disallow: /api/',
        ];
        if (! empty($cfg['noindex_search'])) {
            $lines[] = 'Disallow: /search';
        }
        if (! empty($cfg['sitemap_enabled'])) {
            $lines[] = 'Sitemap: '.$base.'/sitemap.xml';
        }

        return implode("\n", $lines)."\n";
    }

    protected function base(Tenant $tenant): string
    {
        if (! empty($tenant->domain)) {
            return 'https://'.preg_replace('#^https?://#', '', (string) $tenant->domain);
        }

        return rtrim((string) config('app.frontend_url', ''), '/');
    }

    /** @param  list<array{loc: string, lastmod?: string}>  $urls */
    protected function urlset(array $urls): string
    {
        $body = '';
        foreach ($urls as $u) {
            $body .= '  <url><loc>'.e($u['loc']).'</loc>';
            if (! empty($u['lastmod'])) {
                $body .= '<lastmod>'.e($u['lastmod']).'</lastmod>';
            }
            $body .= "</url>\n";
        }

        return '<?xml version="1.0" encoding="UTF-8"?>'."\n"
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n"
            .$body
            .'</urlset>';
    }

    protected function emptyUrlset(): string
    {
        return $this->urlset([]);
    }
}
