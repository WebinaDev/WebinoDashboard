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
            'separator' => '|',
            'title_template' => '{title} {separator} {site}',
            'home_title' => '',
            'home_description' => '',
            'og_image' => '',
            'twitter_card' => 'summary_large_image',
            'organization_name' => '',
            'organization_logo' => '',
            'organization_same_as' => '',
            'robots_default' => 'index,follow',
            'noindex_search' => true,
            'noindex_archives' => false,
            'sitemap_enabled' => true,
            'sitemap_include_products' => true,
            'sitemap_include_posts' => true,
            'sitemap_include_pages' => true,
            'sitemap_include_news' => true,
            'sitemap_include_videos' => true,
            'news_publication_name' => '',
            'news_language' => 'fa',
            'schema_organization_enabled' => true,
            'schema_website_enabled' => true,
            'canonical_force_https' => true,
            'redirect_trailing_slash' => false,
        ];
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
        foreach ($defaults as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $value = $input[$key];
            if (is_bool($default)) {
                $current[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? (bool) $value;
            } elseif (is_string($default)) {
                $current[$key] = is_scalar($value) ? mb_substr(trim((string) $value), 0, 500) : $default;
            } else {
                $current[$key] = $value;
            }
        }
        $this->settings->put($tenantId, self::MODULE, self::KEY, $current);

        return $this->get($tenantId);
    }
}
