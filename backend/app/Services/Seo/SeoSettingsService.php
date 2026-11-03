<?php

namespace App\Services\Seo;

use App\Services\Modules\ModuleSettingsService;

final class SeoSettingsService
{
    public const MODULE = 'seo';

    public const KEY = 'site';

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            // Titles & home meta
            'separator' => '|',
            'title_template' => '{title} {separator} {site}',
            'title_template_product' => '{title} {separator} {site}',
            'title_template_post' => '{title} {separator} {site}',
            'title_template_page' => '{title} {separator} {site}',
            'home_title' => '',
            'home_description' => '',

            // Social / Open Graph
            'og_image' => '',
            'og_title' => '',
            'og_description' => '',
            'twitter_card' => 'summary_large_image',

            // Organization / schema
            'organization_name' => '',
            'organization_logo' => '',
            'organization_same_as' => '',
            'schema_organization_enabled' => true,
            'schema_website_enabled' => true,
            'schema_breadcrumb_enabled' => true,

            // Robots
            'robots_default' => 'index,follow',
            'noindex_search' => true,
            'noindex_archives' => false,
            'noindex_tags' => false,
            'noindex_authors' => false,
            'noindex_attachments' => true,
            'noindex_paginated' => false,
            'robots_txt_extra' => '',

            // Sitemap
            'sitemap_enabled' => true,
            'sitemap_include_products' => true,
            'sitemap_include_posts' => true,
            'sitemap_include_pages' => true,
            'sitemap_include_news' => true,
            'sitemap_include_videos' => true,
            'news_publication_name' => '',
            'news_language' => 'fa',

            // Canonical
            'canonical_force_https' => true,
            'canonical_strip_params' => true,
            'redirect_trailing_slash' => false,

            // Breadcrumbs
            'breadcrumbs_enabled' => true,
            'breadcrumbs_show_home' => true,
            'breadcrumbs_home_label' => '',
            'breadcrumbs_separator' => '›',

            // Webmaster / Search Console verification hooks
            'google_site_verification' => '',
            'bing_site_verification' => '',
            'yandex_verification' => '',
            'pinterest_verification' => '',
        ];
    }

    /** @return array<string, int> */
    protected function stringMaxLengths(): array
    {
        return [
            'separator' => 8,
            'title_template' => 120,
            'title_template_product' => 120,
            'title_template_post' => 120,
            'title_template_page' => 120,
            'home_title' => 200,
            'home_description' => 500,
            'og_image' => 500,
            'og_title' => 200,
            'og_description' => 500,
            'twitter_card' => 40,
            'organization_name' => 200,
            'organization_logo' => 500,
            'organization_same_as' => 2000,
            'robots_default' => 80,
            'robots_txt_extra' => 4000,
            'news_publication_name' => 200,
            'news_language' => 12,
            'breadcrumbs_home_label' => 80,
            'breadcrumbs_separator' => 8,
            'google_site_verification' => 120,
            'bing_site_verification' => 120,
            'yandex_verification' => 120,
            'pinterest_verification' => 120,
        ];
    }

    /** Canonical site path for a product, honouring `product_permalink_base` (root for migrated WP stores). */
    public function productPath(int $tenantId, string $slug): string
    {
        return self::productPathFor($this->get($tenantId), $slug);
    }

    /** @param  array<string, mixed>  $cfg */
    public static function productPathFor(array $cfg, string $slug): string
    {
        $base = trim((string) ($cfg['product_permalink_base'] ?? 'product'), "/ \t");

        return ($base === '' ? '' : '/'.$base).'/'.$slug;
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, self::MODULE, self::KEY, []);

        return array_merge($this->defaults(), is_array($stored) ? $stored : []);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, array $input): array
    {
        $current = $this->get($tenantId);
        $defaults = $this->defaults();
        $maxLengths = $this->stringMaxLengths();
        foreach ($defaults as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $value = $input[$key];
            if (is_bool($default)) {
                $current[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? (bool) $value;
            } elseif (is_string($default)) {
                $max = $maxLengths[$key] ?? 500;
                $current[$key] = is_scalar($value) ? mb_substr(trim((string) $value), 0, $max) : $default;
            } else {
                $current[$key] = $value;
            }
        }
        $current['product_permalink_base'] = strtolower(trim((string) preg_replace('/[^A-Za-z0-9\-_]/', '', (string) ($current['product_permalink_base'] ?? 'product'))));
        $this->settings->put($tenantId, self::MODULE, self::KEY, $current);

        return $this->get($tenantId);
    }
}
