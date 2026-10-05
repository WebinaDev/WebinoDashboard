<?php

namespace App\Services\Shop;

use App\Kernel\ThemeCatalog;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;

/**
 * Classic storefront theme settings (Webino «تنظیمات قالب»).
 * Flat color keys stay for backward compatibility; nested sections mirror Parisma panels.
 */
final class StorefrontAppearanceService
{
    public const MODULE = 'shop';

    public const KEY = 'storefront_appearance';

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            'primary_color' => '#e775ae',
            'secondary_color' => '#021959',
            'accent_color' => '#dc5f9d',
            'text1_color' => '#021959',
            'text2_color' => '#4d5e8a',
            'text3_color' => '#8b97b3',
            'navy_color' => '#021959',
            'surface_color' => '#f3f5f8',
            'header_bg' => '#ffffff',
            'footer_bg' => '#ffffff',
            'border_color' => '#e8edf3',
            'header_style' => 'classic',
            'mega_menu' => true,
            'dark_mode_default' => false,
            'show_top_bar' => true,
            'top_bar_text' => '',
            'product_card_style' => 'classic',
            'pdp_gallery_style' => 'thumbs',
            'sticky_add_to_cart' => true,
            'show_installment_badge' => true,
            'footer_columns' => 4,
            'typography' => [
                'font_family' => 'yekan-bakh',
                'font_size' => 14,
                'font_weight' => 400,
                'line_height' => 1.7,
            ],
            'general' => [
                'logo_height_desktop' => 48,
                'logo_height_mobile' => 36,
                'logo_404_url' => '',
                'bg_404' => '',
                'loading_icon_url' => '',
                'mobile_bottom_menu_enabled' => true,
                'mobile_bottom_menu' => [
                    ['label' => 'خانه', 'href' => '/', 'icon' => 'home'],
                    ['label' => 'دسته‌ها', 'href' => '/shop', 'icon' => 'grid'],
                    ['label' => 'سبد', 'href' => '/cart', 'icon' => 'cart'],
                    ['label' => 'حساب', 'href' => '/account', 'icon' => 'user'],
                ],
            ],
            'header' => [
                'ajax_search' => true,
                'ajax_search_mobile' => true,
                'search_placeholder' => 'جستجوی محصولات',
                'voice_search' => false,
                'quick_voice_search' => false,
                'search_title_only' => false,
                'search_sku' => false,
                'deals_enabled' => true,
                'deals_title' => 'شگفت انگیز',
                'deals_subtitle' => '',
                'deals_link' => '/amazing-offers',
                'deals_timer_end' => '',
                'deals_timer_title' => '',
                'mega_menu' => true,
                'mega_menu_title' => 'دسته‌بندی محصولات',
                'sticky_desktop' => true,
                'banner_enabled' => false,
                'banner_type' => 'image',
                'banner_link' => '',
                'banner_image_desktop' => '',
                'banner_image_mobile' => '',
                'banner_text' => '',
                'banner_bg' => '#021959',
                'banner_text_color' => '#ffffff',
            ],
            'footer' => [
                'about' => '',
                'trust_text' => '',
                'enamad_html' => '',
                'samandehi_html' => '',
                'ecommerce_badge_html' => '',
                'footer_links' => [],
                'copyright' => '',
                'copyright_sub' => '',
                'support_phone' => '',
                'support_email_title' => 'ایمیل پشتیبانی',
                'support_email' => '',
                'address_title' => 'آدرس',
                'address' => '',
                'social_telegram' => '',
                'social_twitter' => '',
                'social_whatsapp' => '',
                'social_facebook' => '',
                'social_igap' => '',
                'social_rubika' => '',
                'social_soroush' => '',
                'social_bale' => '',
                'social_eitaa' => '',
                'payment_methods' => [],
                'show_developer_credit' => true,
                'developer_title' => 'طراحی و توسعه',
                'developer_name' => 'وبینو',
                'developer_link' => '',
                'developer_logo' => '',
            ],
            'commerce' => [
                'ajax_add_to_cart' => true,
                'product_share' => true,
                'gallery_lightbox' => true,
                'gallery_thumbs' => 'bottom',
                'important_attrs_count' => 4,
                'features' => [],
                'shipping_text_enabled' => true,
                'shipping_text' => '',
                'installment_enabled' => true,
                'installment_title' => 'خرید اقساطی',
                'installment_text' => '',
                'installment_link' => '',
                'installment_image' => '',
                'card_installment_enabled' => true,
                'card_installment_text' => 'اقساطی',
                'card_installment_image' => '',
                'sticky_cart_mobile' => true,
                'sticky_cart_desktop' => false,
                'sticky_cart_side' => 'bottom',
                'card_add_to_cart' => true,
                'compare_enabled' => true,
                'show_rating' => true,
                'fake_stats_enabled' => false,
                'fake_stats_factor' => 1,
            ],
            'archive' => [
                'sidebar_enabled' => true,
                'category_slider' => true,
                'product_columns' => 3,
                'products_per_page' => 12,
                'default_sort' => 'newest',
                'filters_open_default' => false,
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, self::MODULE, self::KEY, []);
        $merged = $this->deepMerge($this->defaults(), is_array($stored) ? $stored : []);

        return $this->syncLegacyFlags($merged);
    }

    /**
     * Public payload: full settings (no secrets). Colors + chrome toggles for storefront.
     *
     * @return array<string, mixed>
     */
    public function publicPayload(int $tenantId): array
    {
        return $this->get($tenantId);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, array $input): array
    {
        $defaults = $this->defaults();
        $current = $this->get($tenantId);
        $sanitized = $this->sanitizeAgainstDefaults($input, $defaults);
        $merged = $this->deepMerge($current, $sanitized);
        $merged = $this->syncLegacyFlags($merged);
        $this->settings->put($tenantId, self::MODULE, self::KEY, $merged);
        $this->syncBrandingPalette($tenantId, $merged);

        return $this->get($tenantId);
    }

    /**
     * Keep site Style palette aligned so storefront CSS vars follow either panel.
     *
     * @param  array<string, mixed>  $appearance
     */
    private function syncBrandingPalette(int $tenantId, array $appearance): void
    {
        $tenant = Tenant::query()->find($tenantId);
        if (! $tenant) {
            return;
        }
        $map = [
            'primary' => $appearance['primary_color'] ?? null,
            'secondary' => $appearance['secondary_color'] ?? null,
            'accent' => $appearance['accent_color'] ?? null,
            'text' => $appearance['text1_color'] ?? null,
            'muted' => $appearance['text2_color'] ?? null,
            'text3' => $appearance['text3_color'] ?? null,
            'navy' => $appearance['navy_color'] ?? null,
            'surface' => $appearance['surface_color'] ?? null,
            'header' => $appearance['header_bg'] ?? null,
            'footer' => $appearance['footer_bg'] ?? null,
            'border' => $appearance['border_color'] ?? null,
        ];
        $palette = [];
        foreach ($map as $key => $value) {
            if (is_string($value) && $value !== '') {
                $palette[$key] = $value;
            }
        }
        if ($palette === []) {
            return;
        }
        $existing = is_array($tenant->branding) ? $tenant->branding : [];
        $existingPalette = is_array($existing['palette'] ?? null) ? $existing['palette'] : [];
        $tenant->branding = ThemeCatalog::mergeIntoExisting(
            $existing,
            ['palette' => array_merge($existingPalette, $palette)]
        );
        $tenant->save();
    }

    /**
     * Keep flat mega_menu / sticky_add_to_cart / show_installment_badge in sync with nested sections.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function syncLegacyFlags(array $data): array
    {
        if (isset($data['header']) && is_array($data['header'])) {
            if (array_key_exists('mega_menu', $data['header'])) {
                $data['mega_menu'] = (bool) $data['header']['mega_menu'];
            } elseif (array_key_exists('mega_menu', $data)) {
                $data['header']['mega_menu'] = (bool) $data['mega_menu'];
            }
        }
        if (isset($data['commerce']) && is_array($data['commerce'])) {
            if (array_key_exists('sticky_cart_mobile', $data['commerce'])) {
                $data['sticky_add_to_cart'] = (bool) $data['commerce']['sticky_cart_mobile'];
            }
            if (array_key_exists('card_installment_enabled', $data['commerce'])) {
                $data['show_installment_badge'] = (bool) $data['commerce']['card_installment_enabled'];
            }
            if (array_key_exists('gallery_thumbs', $data['commerce'])) {
                $data['pdp_gallery_style'] = (string) $data['commerce']['gallery_thumbs'];
            }
        }

        return $data;
    }

    /**
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    private function sanitizeAgainstDefaults(array $input, array $defaults): array
    {
        $out = [];
        foreach ($defaults as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $value = $input[$key];
            if (is_array($default)) {
                if (! is_array($value)) {
                    continue;
                }
                // List/repeater (numeric keys) — sanitize items loosely
                if ($default === [] || array_is_list($default)) {
                    $out[$key] = $this->sanitizeList($value, $key);
                    continue;
                }
                $out[$key] = $this->sanitizeAgainstDefaults($value, $default);
                continue;
            }
            if (is_bool($default)) {
                $out[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? (bool) $value;
            } elseif (is_int($default)) {
                $out[$key] = (int) $value;
            } elseif (is_float($default)) {
                $out[$key] = (float) $value;
            } elseif ((str_ends_with($key, '_color') || str_ends_with($key, '_bg') || $key === 'banner_bg' || $key === 'banner_text_color') && is_string($value)) {
                $hex = $this->normalizeHex($value);
                if ($hex !== null) {
                    $out[$key] = $hex;
                }
            } else {
                $out[$key] = is_scalar($value) ? mb_substr(trim((string) $value), 0, $this->maxLen($key)) : $default;
            }
        }

        // Allow nested section keys present in input even when only partially sent
        foreach (['typography', 'general', 'header', 'footer', 'commerce', 'archive'] as $section) {
            if (! isset($input[$section]) || ! is_array($input[$section]) || ! isset($defaults[$section])) {
                continue;
            }
            if (! isset($out[$section])) {
                $out[$section] = $this->sanitizeAgainstDefaults($input[$section], $defaults[$section]);
            }
        }

        return $out;
    }

    private function maxLen(string $key): int
    {
        if (str_contains($key, 'html') || str_contains($key, 'text') || str_contains($key, 'about') || str_contains($key, 'copyright')) {
            return 5000;
        }

        return 500;
    }

    /**
     * @param  list<mixed>  $value
     * @return list<array<string, mixed>>
     */
    private function sanitizeList(array $value, string $key): array
    {
        $items = [];
        foreach (array_slice(array_values($value), 0, 40) as $row) {
            if (! is_array($row)) {
                continue;
            }
            $clean = [];
            foreach ($row as $k => $v) {
                if (! is_string($k)) {
                    continue;
                }
                if (is_array($v)) {
                    // nested links under footer_links
                    $nested = [];
                    foreach (array_slice(array_values($v), 0, 30) as $child) {
                        if (! is_array($child)) {
                            continue;
                        }
                        $nested[] = [
                            'label' => mb_substr(trim((string) ($child['label'] ?? '')), 0, 120),
                            'href' => mb_substr(trim((string) ($child['href'] ?? '')), 0, 500),
                        ];
                    }
                    $clean[$k] = $nested;
                } elseif (is_scalar($v)) {
                    $clean[$k] = mb_substr(trim((string) $v), 0, 500);
                }
            }
            if ($clean !== []) {
                $items[] = $clean;
            }
        }

        return $items;
    }

    private function normalizeHex(string $value): ?string
    {
        $v = trim($value);
        if (preg_match('/^#?[0-9a-fA-F]{6}$/', $v)) {
            return str_starts_with($v, '#') ? strtolower($v) : '#'.strtolower($v);
        }
        if (preg_match('/^#?[0-9a-fA-F]{3}$/', $v)) {
            $s = ltrim(strtolower($v), '#');

            return '#'.$s[0].$s[0].$s[1].$s[1].$s[2].$s[2];
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>  $over
     * @return array<string, mixed>
     */
    private function deepMerge(array $base, array $over): array
    {
        foreach ($over as $key => $value) {
            if (is_array($value) && isset($base[$key]) && is_array($base[$key]) && ! array_is_list($base[$key]) && ! array_is_list($value)) {
                $base[$key] = $this->deepMerge($base[$key], $value);
            } else {
                $base[$key] = $value;
            }
        }

        return $base;
    }
}
