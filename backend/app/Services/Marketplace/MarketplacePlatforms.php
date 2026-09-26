<?php

namespace App\Services\Marketplace;

/**
 * Static catalog of supported marketplaces (order matches the WordPress hub).
 */
final class MarketplacePlatforms
{
    public const API = 'api';

    public const FEED = 'feed';

    /** @var array<string, array{label: string, label_en: string, kind: string, pricing_tab: string, orders: bool, create: bool, default_unit: string}> */
    public const CATALOG = [
        'basalam' => ['label' => 'باسلام', 'label_en' => 'Basalam', 'kind' => self::API, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => true, 'default_unit' => 'rial'],
        'digikala' => ['label' => 'دیجی‌کالا', 'label_en' => 'Digikala', 'kind' => self::API, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => false, 'default_unit' => 'rial'],
        'snappshop' => ['label' => 'اسنپ‌شاپ', 'label_en' => 'SnappShop', 'kind' => self::API, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => false, 'default_unit' => 'toman'],
        'tapsishop' => ['label' => 'تپسی‌شاپ', 'label_en' => 'TapsiShop', 'kind' => self::API, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => false, 'default_unit' => 'toman'],
        'technolife' => ['label' => 'تکنولایف', 'label_en' => 'Technolife', 'kind' => self::API, 'pricing_tab' => 'marketplaces', 'orders' => true, 'create' => false, 'default_unit' => 'toman'],
        'emalls' => ['label' => 'ایمالز', 'label_en' => 'Emalls', 'kind' => self::FEED, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'torob' => ['label' => 'ترب', 'label_en' => 'Torob', 'kind' => self::FEED, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'zarehbin' => ['label' => 'ذره‌بین', 'label_en' => 'Zarehbin', 'kind' => self::FEED, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
        'snapppay-search' => ['label' => 'جستجوی اسنپ‌پی', 'label_en' => 'SnappPay Search', 'kind' => self::FEED, 'pricing_tab' => 'search-engines', 'orders' => false, 'create' => false, 'default_unit' => 'toman'],
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
    ];

    /** @return list<string> */
    public static function slugs(): array
    {
        return array_keys(self::CATALOG);
    }

    /** @return list<string> */
    public static function apiSlugs(): array
    {
        return array_keys(array_filter(self::CATALOG, fn ($p) => $p['kind'] === self::API));
    }

    public static function exists(string $platform): bool
    {
        return isset(self::CATALOG[$platform]);
    }

    public static function isFeed(string $platform): bool
    {
        return (self::CATALOG[$platform]['kind'] ?? null) === self::FEED;
    }

    public static function label(string $platform, string $locale = 'fa'): string
    {
        $row = self::CATALOG[$platform] ?? null;
        if (! $row) {
            return $platform;
        }

        return $locale === 'en' ? $row['label_en'] : $row['label'];
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
