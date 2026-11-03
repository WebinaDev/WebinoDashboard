<?php

namespace App\Services\Marketplace;

/**
 * Static catalog of supported marketplaces (order matches the WordPress hub).
 */
final class MarketplacePlatforms
{
    public const API = 'api';

    public const FEED = 'feed';

    public const LIVE = 'live';

    public const SCAFFOLD = 'scaffold';

    public const CAT_SHOPS = 'shops';

    public const CAT_SEARCH = 'search';

    public const CAT_CLASSIFIEDS = 'classifieds';

    /**
     * Hub category metadata (display order).
     *
     * @var array<string, array{label: string, label_en: string}>
     */
    public const CATEGORIES = [
        self::CAT_SHOPS => ['label' => 'فروشگاه‌های شخص‌ثالث', 'label_en' => 'Third-party shops'],
        self::CAT_SEARCH => ['label' => 'موتورهای جستجوی کالا', 'label_en' => 'Shopping search'],
        self::CAT_CLASSIFIEDS => ['label' => 'آگهی‌ها', 'label_en' => 'Classifieds'],
    ];

    /**
     * @var array<string, array{
     *   label: string,
     *   label_en: string,
     *   kind: string,
     *   category: string,
     *   status: string,
     *   pricing_tab: string,
     *   orders: bool,
     *   create: bool,
     *   default_unit: string
     * }>
     */
    public const CATALOG = [
        // Third-party shops
        'digikala' => ['label' => 'دیجی‌کالا', 'label_en' => 'Digikala', 'kind' => self::API, 'category' => self::CAT_SHOPS, 'status' => self::LIVE, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => false, 'default_unit' => 'rial'],
        'basalam' => ['label' => 'باسلام', 'label_en' => 'Basalam', 'kind' => self::API, 'category' => self::CAT_SHOPS, 'status' => self::LIVE, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => true, 'default_unit' => 'rial'],
        'snappshop' => ['label' => 'اسنپ‌شاپ', 'label_en' => 'SnappShop', 'kind' => self::API, 'category' => self::CAT_SHOPS, 'status' => self::LIVE, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => false, 'default_unit' => 'toman'],
        'tapsishop' => ['label' => 'تپسی‌شاپ', 'label_en' => 'TapsiShop', 'kind' => self::API, 'category' => self::CAT_SHOPS, 'status' => self::LIVE, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => false, 'default_unit' => 'toman'],
        'tapsifood' => ['label' => 'تپسی‌فود', 'label_en' => 'TapsiFood', 'kind' => self::API, 'category' => self::CAT_SHOPS, 'status' => self::SCAFFOLD, 'pricing_tab' => 'marketplaces', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'technolife' => ['label' => 'تکنولایف', 'label_en' => 'Technolife', 'kind' => self::API, 'category' => self::CAT_SHOPS, 'status' => self::LIVE, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => false, 'default_unit' => 'toman'],
        'snappfood' => ['label' => 'اسنپ‌فود', 'label_en' => 'SnappFood', 'kind' => self::API, 'category' => self::CAT_SHOPS, 'status' => self::SCAFFOLD, 'pricing_tab' => 'marketplaces', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'snappmarket' => ['label' => 'اسنپ‌مارکت', 'label_en' => 'SnappMarket', 'kind' => self::API, 'category' => self::CAT_SHOPS, 'status' => self::SCAFFOLD, 'pricing_tab' => 'marketplaces', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        // Shopping search
        'torob' => ['label' => 'ترب', 'label_en' => 'Torob', 'kind' => self::FEED, 'category' => self::CAT_SEARCH, 'status' => self::LIVE, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'emalls' => ['label' => 'ایمالز', 'label_en' => 'Emalls', 'kind' => self::FEED, 'category' => self::CAT_SEARCH, 'status' => self::LIVE, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'shopino' => ['label' => 'شاپینو', 'label_en' => 'Shopino', 'kind' => self::FEED, 'category' => self::CAT_SEARCH, 'status' => self::SCAFFOLD, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'zarehbin' => ['label' => 'ذره‌بین', 'label_en' => 'Zarehbin', 'kind' => self::FEED, 'category' => self::CAT_SEARCH, 'status' => self::LIVE, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'snapppay-search' => ['label' => 'جستجوی اسنپ‌پی', 'label_en' => 'SnappPay Search', 'kind' => self::FEED, 'category' => self::CAT_SEARCH, 'status' => self::LIVE, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'passazh' => ['label' => 'پاساژ', 'label_en' => 'Passazh', 'kind' => self::FEED, 'category' => self::CAT_SEARCH, 'status' => self::SCAFFOLD, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        // Classifieds
        'divar' => ['label' => 'دیوار', 'label_en' => 'Divar', 'kind' => self::API, 'category' => self::CAT_CLASSIFIEDS, 'status' => self::SCAFFOLD, 'pricing_tab' => 'marketplaces', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'sheypoor' => ['label' => 'شیپور', 'label_en' => 'Sheypoor', 'kind' => self::API, 'category' => self::CAT_CLASSIFIEDS, 'status' => self::SCAFFOLD, 'pricing_tab' => 'marketplaces', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
    ];

    /** Credential keys that are never returned to the client. */
    public const SECRETS = [
        'digikala' => ['private_key', 'encrypted_code', 'webhook_secret'],
        'basalam' => ['access_token', 'refresh_token', 'client_secret', 'webhook_token', 'gateway_secret'],
        'technolife' => ['api_key'],
        'snappshop' => ['token', 'token_api'],
        'tapsishop' => ['password', 'token'],
        'emalls' => [],
        'zarehbin' => [],
        'snapppay-search' => [],
        'torob' => ['webhook_token'],
        'tapsifood' => [],
        'snappfood' => [],
        'snappmarket' => [],
        'shopino' => [],
        'passazh' => [],
        'divar' => [],
        'sheypoor' => [],
    ];

    /** @return list<string> */
    public static function slugs(): array
    {
        return array_keys(self::CATALOG);
    }

    /** @return list<string> */
    public static function liveSlugs(): array
    {
        return array_keys(array_filter(self::CATALOG, fn ($p) => ($p['status'] ?? self::LIVE) === self::LIVE));
    }

    /** @return list<string> */
    public static function apiSlugs(): array
    {
        return array_keys(array_filter(self::CATALOG, fn ($p) => $p['kind'] === self::API && ($p['status'] ?? self::LIVE) === self::LIVE));
    }

    public static function exists(string $platform): bool
    {
        return isset(self::CATALOG[$platform]);
    }

    public static function isFeed(string $platform): bool
    {
        return (self::CATALOG[$platform]['kind'] ?? null) === self::FEED;
    }

    public static function isLive(string $platform): bool
    {
        return (self::CATALOG[$platform]['status'] ?? self::LIVE) === self::LIVE;
    }

    public static function isScaffold(string $platform): bool
    {
        return (self::CATALOG[$platform]['status'] ?? self::LIVE) === self::SCAFFOLD;
    }

    public static function category(string $platform): string
    {
        return self::CATALOG[$platform]['category'] ?? self::CAT_SHOPS;
    }

    public static function label(string $platform, string $locale = 'fa'): string
    {
        $row = self::CATALOG[$platform] ?? null;
        if (! $row) {
            return $platform;
        }

        return $locale === 'en' ? $row['label_en'] : $row['label'];
    }

    /**
     * @return list<array{id: string, label: string, label_en: string}>
     */
    public static function categoryRows(): array
    {
        $out = [];
        foreach (self::CATEGORIES as $id => $meta) {
            $out[] = ['id' => $id, 'label' => $meta['label'], 'label_en' => $meta['label_en']];
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public static function defaults(string $platform): array
    {
        $credentials = match ($platform) {
            'digikala' => [
                'base_url' => 'https://seller.digikala.com',
                'client_code' => '',
                'encrypted_code' => '',
                'private_key' => '',
                'public_key' => '',
                'credit_increase_percentage' => 0,
                'webhook_secret' => '',
                'webhook_events' => [],
            ],
            'basalam' => [
                'base_url' => 'https://openapi.basalam.com',
                'auth_url' => 'https://auth.basalam.com/oauth/token',
                'access_token' => '',
                'refresh_token' => '',
                'vendor_id' => '',
                'client_id' => '',
                'client_secret' => '',
                'webhook_token' => '',
                'gateway_secret' => '',
            ],
            'technolife' => [
                'api_key' => '',
                'base_url' => '',
                'auth_header' => 'bearer',
                'products_path' => 'api/v1/seller/products',
                'price_path' => 'api/v1/seller/variants/{variant_id}/price',
                'stock_path' => 'api/v1/seller/variants/{variant_id}/stock',
                'orders_path' => 'api/v1/seller/orders',
                'order_path' => 'api/v1/seller/orders/{order_id}',
                'test_path' => 'api/v1/seller/me',
            ],
            'snappshop' => [
                'base_url' => 'https://apix.snappshop.ir',
                'automation_base_url' => 'https://apix.snappshop.ir/automation/v1',
                'token' => '',
                'token_api' => '',
                'vendor_id' => '',
                'shop_code' => '',
                'user_agent' => '',
            ],
            'tapsishop' => [
                'base_url' => 'https://vendorgw.tapsi.shop',
                'username' => '',
                'password' => '',
                'store_id' => '',
                'client_name' => 'vendor.dartil.com',
                'client_version' => '1.0.0.0',
                'token' => '',
                'token_name' => '5',
            ],
            'zarehbin' => ['per_page' => 50, 'version' => '1.0.0', 'expand_variations' => false],
            'emalls' => ['per_page' => 50, 'version' => '1.3.0', 'expand_variations' => true],
            'snapppay-search' => ['per_page' => 100, 'version' => '1.0.2', 'expand_variations' => false],
            'torob' => [
                'per_page' => 50,
                'order_status_enabled' => true,
                'orders_list_api_enabled' => true,
                'product_page_webhook_enabled' => true,
                'action_tracking_enabled' => false,
                'expand_variations' => true,
                'webhook_token' => '',
                'shop_api_token' => '',
            ],
            default => [],
        };

        return [
            'enabled' => false,
            'auto_sync' => false,
            'credentials' => $credentials,
        ];
    }
}
