<?php

namespace App\Services\Seo;

use App\Models\BlogPost;
use App\Models\CmsPage;
use App\Models\Product;
use App\Models\Tenant;

final class SeoMetaBuilder
{
    public function __construct(protected SeoSettingsService $settings) {}

    /**
     * @param  array<string, mixed>  $entitySeo  Per-entity overrides (meta keys or seo json)
     * @return array<string, mixed>
     */
    public function build(Tenant $tenant, string $path, string $fallbackTitle = '', string $fallbackDescription = '', array $entitySeo = [], ?string $type = null): array
    {
        $cfg = $this->settings->get((int) $tenant->id);
        $site = (string) ($tenant->store_display_name ?: $tenant->name ?: 'Webino');
        $title = trim((string) ($entitySeo['seo_title'] ?? $entitySeo['title'] ?? $fallbackTitle));
        $description = trim((string) ($entitySeo['seo_description'] ?? $entitySeo['description'] ?? $fallbackDescription));
        $keyword = trim((string) ($entitySeo['seo_keyword'] ?? $entitySeo['focus_keyword'] ?? ''));
        $robots = trim((string) ($entitySeo['seo_robots'] ?? $entitySeo['robots'] ?? $cfg['robots_default']));
        $ogTitle = trim((string) ($entitySeo['seo_og_title'] ?? $entitySeo['og_title'] ?? $title));
        $ogImage = trim((string) ($entitySeo['seo_og_image'] ?? $entitySeo['og_image'] ?? $cfg['og_image']));
        $ogDescription = trim((string) ($entitySeo['og_description'] ?? $description));
        $schemaType = trim((string) ($entitySeo['schema_type'] ?? $type ?? 'WebPage'));

        if ($title === '') {
            $title = $path === '/' || $path === '' ? ((string) $cfg['home_title'] ?: $site) : $site;
        }
        // Every page needs a meta description: entity SEO → entity fallback (e.g. page excerpt) → site description.
        if ($description === '') {
            $description = trim((string) $cfg['home_description']);
        }

        $fullTitle = str_replace(
            ['{title}', '{separator}', '{site}'],
            [$title, (string) $cfg['separator'], $site],
            (string) $cfg['title_template']
        );
        // Avoid "Site | Site" when title already equals site name.
        if (trim($title) === $site || $path === '/' || $path === '') {
            $home = trim((string) $cfg['home_title']);
            $fullTitle = $home !== '' ? $home : $site;
            if ($title !== '' && $title !== $site) {
                $fullTitle = str_replace(
                    ['{title}', '{separator}', '{site}'],
                    [$title, (string) $cfg['separator'], $site],
                    (string) $cfg['title_template']
                );
            }
        }

        $base = rtrim((string) ($tenant->domain ? ('https://'.$tenant->domain) : config('app.frontend_url', '')), '/');
        $canonical = $base.($path === '' ? '/' : (str_starts_with($path, '/') ? $path : '/'.$path));

        return [
            'title' => $fullTitle,
            'description' => $description,
            'keywords' => $keyword,
            'robots' => $robots,
            'canonical' => $canonical,
            'og' => [
                'title' => $ogTitle !== '' ? $ogTitle : $fullTitle,
                'description' => $ogDescription,
                'image' => $ogImage,
                'type' => $schemaType === 'Product' ? 'product' : 'website',
                'url' => $canonical,
                'site_name' => $site,
            ],
            'twitter' => [
                'card' => (string) $cfg['twitter_card'],
                'title' => $ogTitle !== '' ? $ogTitle : $fullTitle,
                'description' => $ogDescription,
                'image' => $ogImage,
            ],
            'schema_type' => $schemaType,
            'site_name' => $site,
        ];
    }

    /** @return array<string, mixed> */
    public function forProduct(Tenant $tenant, Product $product): array
    {
        $meta = is_array($product->meta) ? $product->meta : [];
        $seo = [
            'seo_title' => $meta['seo_title'] ?? null,
            'seo_description' => $meta['seo_description'] ?? null,
            'seo_keyword' => $meta['seo_keyword'] ?? null,
            'seo_robots' => $meta['seo_robots'] ?? null,
            'seo_og_title' => $meta['seo_og_title'] ?? null,
            'seo_og_image' => $meta['seo_og_image'] ?? ($product->image_url ?? null),
            'schema_type' => 'Product',
        ];

        return $this->build(
            $tenant,
            $this->settings->productPath((int) $tenant->id, (string) $product->slug),
            (string) $product->name,
            mb_substr(strip_tags((string) ($product->short_description ?? $product->description ?? '')), 0, 160),
            $seo,
            'Product'
        );
    }

    /** @return array<string, mixed> */
    public function forBlogPost(Tenant $tenant, BlogPost $post): array
    {
        $seo = is_array($post->seo) ? $post->seo : [];
        $seo['schema_type'] = $seo['schema_type'] ?? 'Article';

        return $this->build(
            $tenant,
            '/blog/'.$post->slug,
            (string) $post->title,
            mb_substr(strip_tags((string) ($post->excerpt ?? '')), 0, 160),
            $seo,
            (string) ($seo['schema_type'] ?? 'Article')
        );
    }

    /** @return array<string, mixed> */
    public function forCmsPage(Tenant $tenant, CmsPage $page): array
    {
        $meta = is_array($page->meta ?? null) ? $page->meta : [];
        $seoCol = is_array($page->seo ?? null) ? $page->seo : [];
        $seo = array_merge($meta, $seoCol);
        $seo = [
            'seo_title' => $seo['seo_title'] ?? $seo['title'] ?? null,
            'seo_description' => $seo['seo_description'] ?? $seo['description'] ?? null,
            'seo_keyword' => $seo['seo_keyword'] ?? $seo['focus_keyword'] ?? null,
            'seo_robots' => $seo['seo_robots'] ?? $seo['robots'] ?? null,
            'seo_og_title' => $seo['seo_og_title'] ?? $seo['og_title'] ?? null,
            'seo_og_image' => $seo['seo_og_image'] ?? $seo['og_image'] ?? null,
            'schema_type' => $seo['schema_type'] ?? 'WebPage',
        ];

        $meta = $this->build(
            $tenant,
            '/'.ltrim((string) $page->slug, '/'),
            (string) $page->title,
            mb_substr(strip_tags((string) ($page->excerpt ?? '')), 0, 160),
            $seo,
            (string) $seo['schema_type']
        );
        $raw = is_array($page->seo ?? null) ? $page->seo : [];
        if (! empty($raw['canonical']) && is_string($raw['canonical']) && str_starts_with($raw['canonical'], 'https://')) {
            $meta['canonical'] = $raw['canonical'];
        }
        $meta['lang'] = $page->lang;
        // Resume theme pages: title/description/site name follow the page language (identity name + headline).
        if (str_starts_with((string) $page->translation_group, 'resume-') && empty($seo['seo_title'])) {
            $meta = $this->resumeLocalized($tenant, $meta, (string) ($page->lang ?: 'fa'));
        }
        $meta['breadcrumb'] = ($raw['breadcrumb'] ?? true) !== false;
        // hreflang alternates: this page plus published translations in the same group.
        $meta['alternates'] = [];
        if ($page->translation_group) {
            $base = rtrim((string) preg_replace('#/[^/]*$#', '', (string) $meta['canonical']), '/');
            $siblings = CmsPage::query()->where('tenant_id', $page->tenant_id)->where('translation_group', $page->translation_group)
                ->where('published', true)->whereNotNull('lang')->orderBy('id')->get(['slug', 'lang']);
            foreach ($siblings as $sib) {
                $meta['alternates'][] = ['lang' => $sib->lang, 'url' => $sib->slug === 'home' ? $base.'/' : $base.'/'.$sib->slug];
            }
        }

        return $meta;
    }

    /**
     * @param  array<string, mixed>  $meta
     * @return array<string, mixed>
     */
    private function resumeLocalized(Tenant $tenant, array $meta, string $lang): array
    {
        $prev = \App\Services\Resume\ResumeScope::current();
        \App\Services\Resume\ResumeScope::set((int) $tenant->id);
        try {
            $id = \App\Models\Resume\ResumeIdentity::query()->first();
        } catch (\Throwable) {
            $id = null;
        } finally {
            \App\Services\Resume\ResumeScope::set($prev);
        }
        if (! $id) {
            return $meta;
        }
        $other = $lang === 'en' ? 'fa' : 'en';
        $name = trim((string) ($id->{'full_name_'.$lang} ?: $id->{'full_name_'.$other}));
        if ($name === '') {
            return $meta;
        }
        $headline = trim((string) ($id->{'headline_'.$lang} ?? ''));
        $meta['title'] = $name;
        $meta['site_name'] = $name;
        if ($headline !== '') {
            $meta['description'] = mb_substr($headline, 0, 160);
        }
        foreach (['og', 'twitter'] as $k) {
            if (isset($meta[$k]) && is_array($meta[$k])) {
                $meta[$k]['title'] = $name;
                if ($headline !== '') {
                    $meta[$k]['description'] = $meta['description'];
                }
                if ($k === 'og') {
                    $meta[$k]['site_name'] = $name;
                    $meta[$k]['locale'] = $lang === 'en' ? 'en_US' : 'fa_IR';
                }
            }
        }
        if (($meta['canonical'] ?? '') !== '' && str_ends_with((string) $meta['canonical'], '/home')) {
            $meta['canonical'] = substr((string) $meta['canonical'], 0, -4);
            if (isset($meta['og']['url'])) {
                $meta['og']['url'] = $meta['canonical'];
            }
        }

        return $meta;
    }

    /**
     * @param  array<string, mixed>  $meta
     * @return list<array<string, mixed>>
     */
    public function jsonLdGraphs(Tenant $tenant, array $meta, ?Product $product = null, ?BlogPost $post = null): array
    {
        $cfg = $this->settings->get((int) $tenant->id);
        $graphs = [];
        $site = $meta['site_name'] ?? ($tenant->store_display_name ?: $tenant->name);
        $base = rtrim((string) ($meta['canonical'] ?? ''), '/');
        $origin = preg_replace('#/[^/]*$#', '', $base) ?: $base;

        if (! empty($cfg['schema_organization_enabled'])) {
            $org = [
                '@type' => 'Organization',
                'name' => (string) ($cfg['organization_name'] ?: $site),
                'url' => $origin ?: $base,
            ];
            if (! empty($cfg['organization_logo'])) {
                $org['logo'] = $cfg['organization_logo'];
            }
            $sameAs = array_values(array_filter(array_map('trim', preg_split('/[\n,]+/', (string) $cfg['organization_same_as']) ?: [])));
            if ($sameAs !== []) {
                $org['sameAs'] = $sameAs;
            }
            $graphs[] = $org;
        }

        if (! empty($cfg['schema_website_enabled'])) {
            $graphs[] = [
                '@type' => 'WebSite',
                'name' => $site,
                'url' => $origin ?: $base,
                'potentialAction' => [
                    '@type' => 'SearchAction',
                    'target' => ($origin ?: $base).'/search?q={search_term_string}',
                    'query-input' => 'required name=search_term_string',
                ],
            ];
        }

        if ($product !== null) {
            $graphs[] = [
                '@type' => 'Product',
                'name' => $product->name,
                'description' => $meta['description'] ?? '',
                'sku' => (string) ($product->sku ?? $product->id),
                'image' => $meta['og']['image'] ?? null,
                'offers' => [
                    '@type' => 'Offer',
                    'priceCurrency' => strtoupper((string) ($product->currency ?: $tenant->default_currency ?: 'IRT')),
                    'price' => round(((int) ($product->sale_price_minor ?: $product->price_minor)) / 10, 2),
                    'availability' => ((int) ($product->stock ?? 0) > 0 || ! $product->manage_stock)
                        ? 'https://schema.org/InStock'
                        : 'https://schema.org/OutOfStock',
                    'url' => $meta['canonical'] ?? null,
                ],
            ];
            $productGraph = &$graphs[array_key_last($graphs)];
            $brand = method_exists($product, 'brands') ? $product->brands()->first() : null;
            if ($brand) {
                $productGraph['brand'] = ['@type' => 'Brand', 'name' => $brand->name];
            }
            $reviewStats = \App\Models\ProductReview::query()
                ->where('tenant_id', $tenant->id)
                ->where('product_id', $product->id)
                ->where('status', \App\Models\ProductReview::STATUS_APPROVED)
                ->selectRaw('COUNT(*) as c, AVG(rating) as a')
                ->first();
            if ($reviewStats && (int) $reviewStats->c > 0) {
                $productGraph['aggregateRating'] = [
                    '@type' => 'AggregateRating',
                    'ratingValue' => round((float) $reviewStats->a, 1),
                    'reviewCount' => (int) $reviewStats->c,
                ];
            }
            unset($productGraph);

            $canonicalParts = parse_url((string) ($meta['canonical'] ?? ''));
            $root = isset($canonicalParts['scheme'], $canonicalParts['host'])
                ? $canonicalParts['scheme'].'://'.$canonicalParts['host'].(isset($canonicalParts['port']) ? ':'.$canonicalParts['port'] : '')
                : ($tenant->domain ? 'https://'.$tenant->domain : rtrim((string) config('app.frontend_url', ''), '/'));
            $crumbs = [['name' => $site, 'url' => $root.'/']];
            $crumbs[] = ['name' => 'فروشگاه', 'url' => $root.'/shop'];
            $category = $product->category_id ? \App\Models\Category::query()->find($product->category_id) : null;
            if ($category) {
                $crumbs[] = ['name' => $category->name, 'url' => $root.'/shop?category='.rawurlencode((string) $category->slug)];
            }
            $crumbs[] = ['name' => $product->name, 'url' => $meta['canonical'] ?? ($root.$this->settings->productPath((int) $tenant->id, rawurlencode((string) $product->slug)))];
            $graphs[] = [
                '@type' => 'BreadcrumbList',
                'itemListElement' => array_map(fn ($c, $i) => [
                    '@type' => 'ListItem',
                    'position' => $i + 1,
                    'name' => $c['name'],
                    'item' => $c['url'],
                ], $crumbs, array_keys($crumbs)),
            ];
        }

        if ($post !== null) {
            $graphs[] = [
                '@type' => ($meta['schema_type'] ?? 'Article'),
                'headline' => $post->title,
                'description' => $meta['description'] ?? '',
                'image' => $meta['og']['image'] ?? $post->cover_url,
                'datePublished' => optional($post->published_at)?->toAtomString(),
                'dateModified' => optional($post->updated_at)?->toAtomString(),
                'mainEntityOfPage' => $meta['canonical'] ?? null,
            ];
        }

        return array_values(array_filter($graphs));
    }
}
