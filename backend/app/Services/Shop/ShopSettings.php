<?php

namespace App\Services\Shop;

use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;

/**
 * Sanitized shop management settings (WooCommerce-inspired subset).
 */
final class ShopSettings
{
    public const MODULE = 'settings';

    public const GENERAL_KEY = 'shop.general';

    public const PRODUCTS_KEY = 'shop.products';

    public const TAX_KEY = 'shop.accounting.tax';

    public const ADVANCED_KEY = 'shop.advanced';

    public const DOWNLOADS_KEY = 'shop.downloads';

    public const REVIEWS_KEY = 'shop.reviews';

    public const MAPS_KEY = 'shop.maps';

    public const LOYALTY_KEY = 'shop.loyalty';

    public const ARCHIVE_KEY = 'shop.archive';

    /** @return list<string> */
    public static function allowedCountryCodes(): array
    {
        return [
            'IR', 'AF', 'AE', 'TR', 'IQ', 'SA', 'US', 'GB', 'DE', 'FR', 'CA', 'AU',
            'CN', 'IN', 'PK', 'RU', 'JP', 'KR', 'IT', 'ES', 'NL', 'SE', 'CH', 'QA',
            'KW', 'BH', 'OM', 'AZ', 'AM', 'GE',
        ];
    }

    /** @return array<string, mixed> */
    public static function getGeneral(int $tenantId): array
    {
        return self::mergeStored($tenantId, self::GENERAL_KEY, self::generalDefaults());
    }

    /** @return array<string, mixed> */
    public static function getProducts(int $tenantId): array
    {
        return self::mergeStored($tenantId, self::PRODUCTS_KEY, self::productsDefaults());
    }

    /** @return array<string, mixed> */
    public static function getTax(int $tenantId): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::TAX_KEY);
        $stored = is_array($stored) ? $stored : [];
        $merged = array_replace_recursive(self::taxDefaults(), $stored);
        if (array_key_exists('tax_rate_percent', $stored) && ! array_key_exists('rate_percent', $stored)) {
            $merged['rate_percent'] = (float) $stored['tax_rate_percent'];
        }
        if (array_key_exists('display_prices', $stored)) {
            if (! array_key_exists('display_shop', $stored)) {
                $merged['display_shop'] = (string) $stored['display_prices'];
            }
            if (! array_key_exists('display_cart', $stored)) {
                $merged['display_cart'] = (string) $stored['display_prices'];
            }
        }

        return $merged;
    }

    /** @return array<string, mixed> */
    public static function getAdvanced(int $tenantId): array
    {
        return self::mergeStored($tenantId, self::ADVANCED_KEY, self::advancedDefaults());
    }

    /** @return array<string, mixed> */
    public static function getDownloads(int $tenantId): array
    {
        return self::mergeStored($tenantId, self::DOWNLOADS_KEY, self::downloadsDefaults());
    }

    /** @return array<string, mixed> */
    public static function getReviews(int $tenantId): array
    {
        return self::mergeStored($tenantId, self::REVIEWS_KEY, self::reviewsDefaults());
    }

    /** @return array<string, mixed> */
    public static function getMaps(int $tenantId): array
    {
        return self::mergeStored($tenantId, self::MAPS_KEY, self::mapsDefaults());
    }

    /** @return array<string, mixed> */
    public static function getLoyalty(int $tenantId): array
    {
        return self::mergeStored($tenantId, self::LOYALTY_KEY, self::loyaltyDefaults());
    }

    /** @return array<string, mixed> */
    public static function getArchive(int $tenantId): array
    {
        return self::mergeStored($tenantId, self::ARCHIVE_KEY, self::archiveDefaults());
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function saveDownloads(int $tenantId, array $input): array
    {
        $clean = self::sanitizeDownloads($input);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::DOWNLOADS_KEY, $clean);

        return $clean;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function saveReviews(int $tenantId, array $input): array
    {
        $clean = self::sanitizeReviews($input);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::REVIEWS_KEY, $clean);

        return $clean;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function saveMaps(int $tenantId, array $input): array
    {
        $current = self::getMaps($tenantId);
        $clean = self::sanitizeMaps($input, $current);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::MAPS_KEY, $clean);

        return self::publicMaps($clean);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function saveLoyalty(int $tenantId, array $input): array
    {
        $clean = self::sanitizeLoyalty($input);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::LOYALTY_KEY, $clean);

        return $clean;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function saveArchive(int $tenantId, array $input): array
    {
        $clean = self::sanitizeArchive($input);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::ARCHIVE_KEY, $clean);

        return $clean;
    }

    /** @return array<string, mixed> */
    public static function publicMaps(array $s): array
    {
        $out = $s;
        foreach (['api_key', 'service_api_key'] as $k) {
            $raw = (string) ($out[$k] ?? '');
            $out[$k] = $raw === '' ? '' : self::maskSecret($raw);
            $out[$k.'_set'] = $raw !== '';
        }

        return $out;
    }

    public static function maskSecret(string $raw): string
    {
        $len = mb_strlen($raw);
        if ($len <= 4) {
            return str_repeat('*', $len);
        }

        return mb_substr($raw, 0, 2).str_repeat('*', max(4, $len - 4)).mb_substr($raw, -2);
    }

    /** Default shipping address from store settings when customer leaves it empty. */
    /** @return array<string, mixed> */
    public static function defaultCustomerAddress(int $tenantId): array
    {
        $addr = self::getGeneral($tenantId)['store_address'] ?? [];

        return [
            'address_1' => (string) ($addr['address_1'] ?? ''),
            'address_2' => (string) ($addr['address_2'] ?? ''),
            'city' => (string) ($addr['city'] ?? ''),
            'country' => (string) ($addr['country'] ?? 'IR'),
            'state' => (string) ($addr['state'] ?? ''),
            'postcode' => (string) ($addr['postcode'] ?? ''),
            'source' => 'store_address',
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function saveGeneral(int $tenantId, array $input): array
    {
        $addrIn = is_array($input['store_address'] ?? null) ? $input['store_address'] : [];
        if (array_key_exists('country', $addrIn)) {
            $country = strtoupper(substr(trim((string) $addrIn['country']), 0, 2));
            if ($country === '' || ! in_array($country, self::allowedCountryCodes(), true)) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'payload.store_address.country' => ['Invalid country code.'],
                ]);
            }
        }
        foreach (['specific_allowed_countries', 'specific_ship_to_countries'] as $listKey) {
            if (! array_key_exists($listKey, $input) || ! is_array($input[$listKey])) {
                continue;
            }
            foreach ($input[$listKey] as $code) {
                $c = strtoupper(substr(trim((string) $code), 0, 2));
                if ($c !== '' && ! in_array($c, self::allowedCountryCodes(), true)) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        "payload.{$listKey}" => ['Invalid country code.'],
                    ]);
                }
            }
        }

        $clean = self::sanitizeGeneral($input);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::GENERAL_KEY, $clean);
        Tenant::query()->where('id', $tenantId)->update([
            'default_currency' => $clean['currency'],
            'store_display_name' => $clean['store_display_name'] !== '' ? $clean['store_display_name'] : null,
        ]);

        return $clean;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function saveProducts(int $tenantId, array $input): array
    {
        $clean = self::sanitizeProducts($input);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::PRODUCTS_KEY, $clean);

        return $clean;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function saveTax(int $tenantId, array $input): array
    {
        $clean = self::sanitizeTax($input);
        // Keep legacy aliases for older consumers.
        $clean['tax_rate_percent'] = $clean['rate_percent'];
        $clean['display_prices'] = $clean['display_shop'];
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::TAX_KEY, $clean);

        return $clean;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function saveAdvanced(int $tenantId, array $input): array
    {
        $current = self::getAdvanced($tenantId);
        $clean = self::sanitizeAdvanced($input);
        // Preserve unknown legacy flags if present.
        $next = array_merge($current, $clean);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::ADVANCED_KEY, $next);

        return $next;
    }

    /**
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    private static function mergeStored(int $tenantId, string $key, array $defaults): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, $key);

        return array_replace_recursive($defaults, is_array($stored) ? $stored : []);
    }

    /** @return array<string, mixed> */
    public static function generalDefaults(): array
    {
        return [
            'store_display_name' => '',
            'store_address' => [
                'address_1' => '',
                'address_2' => '',
                'city' => '',
                'country' => 'IR',
                'state' => '',
                'postcode' => '',
            ],
            'selling_locations' => 'specific',
            'specific_allowed_countries' => ['IR'],
            'ship_to_countries' => 'specific',
            'specific_ship_to_countries' => ['IR'],
            'enable_coupons' => true,
            'enable_coupon_stacking' => false,
            'calc_taxes' => true,
            'currency' => 'IRT',
            'currency_position' => 'left',
            'thousand_separator' => ',',
            'decimal_separator' => '.',
            'price_decimals' => 0,
            'shop_page_id' => null,
            'cart_redirect_after_add' => false,
            'weight_unit' => 'kg',
            'dimension_unit' => 'cm',
        ];
    }

    /** @return array<string, mixed> */
    public static function productsDefaults(): array
    {
        return [
            'manage_stock' => true,
            'hold_stock_minutes' => 60,
            'notify_low_stock' => true,
            'notify_no_stock' => true,
            'stock_email_recipient' => '',
            'low_stock_threshold' => 2,
            'no_stock_threshold' => 0,
            'hide_out_of_stock' => false,
            'stock_format' => 'low_amount',
        ];
    }

    /** @return array<string, mixed> */
    public static function taxDefaults(): array
    {
        return [
            'enabled' => true,
            'rate_percent' => 9,
            'prices_include_tax' => false,
            'tax_based_on' => 'shipping',
            'round_at_subtotal' => false,
            'display_shop' => 'excl',
            'display_cart' => 'excl',
        ];
    }

    /** @return array<string, mixed> */
    public static function advancedDefaults(): array
    {
        return [
            'cart_page_id' => null,
            'checkout_page_id' => null,
            'myaccount_page_id' => null,
            'terms_page_id' => null,
            'force_ssl_checkout' => false,
            'debug_mode' => false,
            'debug_log_enabled' => false,
        ];
    }

    /** @return array<string, mixed> */
    public static function downloadsDefaults(): array
    {
        return [
            'delivery_method' => 'force',
            'x_accel_prefix' => '',
            'require_login' => true,
            'count_downloads' => true,
            'allow_external_redirect' => false,
        ];
    }

    /** @return array<string, mixed> */
    public static function reviewsDefaults(): array
    {
        return [
            'enabled' => true,
            'verified_buyer_only' => false,
            'require_approval' => true,
            'show_average' => true,
        ];
    }

    /** @return array<string, mixed> */
    public static function mapsDefaults(): array
    {
        return [
            'billing_map_enabled' => false,
            'provider' => 'neshan',
            'api_key' => '',
            'service_api_key' => '',
            'map_type' => 'mapboxgl',
        ];
    }

    /** @return array<string, mixed> */
    public static function loyaltyDefaults(): array
    {
        return [
            'enabled' => false,
            'point_price_minor' => 1000,
            'max_points_per_product' => 150,
        ];
    }

    /** @return array<string, mixed> */
    public static function archiveDefaults(): array
    {
        return [
            'sidebar_enabled' => true,
            'category_slider' => true,
            'category_slider_mode' => 'image_title',
            'filter_placement' => 'sidebar',
            'filter_price' => true,
            'filter_in_stock' => true,
            'filter_express' => false,
            'filter_on_sale' => true,
            'filter_color' => true,
            'filters_open_default' => false,
            'products_per_page' => 12,
            'product_columns' => 3,
            'default_sort' => 'newest',
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitizeGeneral(array $input): array
    {
        $d = self::generalDefaults();
        $addrIn = is_array($input['store_address'] ?? null) ? $input['store_address'] : [];
        $country = strtoupper(substr(trim((string) ($addrIn['country'] ?? $d['store_address']['country'])), 0, 2));
        if (! in_array($country, self::allowedCountryCodes(), true)) {
            $country = 'IR';
        }

        $selling = (string) ($input['selling_locations'] ?? $d['selling_locations']);
        if (! in_array($selling, ['all', 'specific'], true)) {
            $selling = 'specific';
        }
        $ship = (string) ($input['ship_to_countries'] ?? $d['ship_to_countries']);
        if (! in_array($ship, ['specific', 'all', 'disabled'], true)) {
            $ship = 'specific';
        }

        $pos = (string) ($input['currency_position'] ?? $d['currency_position']);
        if (! in_array($pos, ['left', 'right', 'left_space', 'right_space'], true)) {
            $pos = 'left';
        }

        $weight = (string) ($input['weight_unit'] ?? $d['weight_unit']);
        if (! in_array($weight, ['g', 'kg'], true)) {
            $weight = 'kg';
        }
        $dim = (string) ($input['dimension_unit'] ?? $d['dimension_unit']);
        if (! in_array($dim, ['cm', 'm'], true)) {
            $dim = 'cm';
        }

        $currency = strtoupper(substr(trim((string) ($input['currency'] ?? $d['currency'])), 0, 3));
        if ($currency === '' || ! preg_match('/^[A-Z]{3}$/', $currency)) {
            $currency = 'IRR';
        }

        $decimals = (int) ($input['price_decimals'] ?? $d['price_decimals']);
        $decimals = max(0, min(6, $decimals));

        $shopPage = $input['shop_page_id'] ?? null;
        $shopPageId = is_numeric($shopPage) ? (int) $shopPage : null;
        if ($shopPageId !== null && $shopPageId <= 0) {
            $shopPageId = null;
        }

        return [
            'store_display_name' => mb_substr(trim((string) ($input['store_display_name'] ?? '')), 0, 120),
            'store_address' => [
                'address_1' => mb_substr(trim((string) ($addrIn['address_1'] ?? '')), 0, 200),
                'address_2' => mb_substr(trim((string) ($addrIn['address_2'] ?? '')), 0, 200),
                'city' => mb_substr(trim((string) ($addrIn['city'] ?? '')), 0, 100),
                'country' => $country,
                'state' => mb_substr(trim((string) ($addrIn['state'] ?? '')), 0, 100),
                'postcode' => mb_substr(trim((string) ($addrIn['postcode'] ?? '')), 0, 20),
            ],
            'selling_locations' => $selling,
            'specific_allowed_countries' => self::sanitizeCountryList($input['specific_allowed_countries'] ?? ['IR']),
            'ship_to_countries' => $ship,
            'specific_ship_to_countries' => self::sanitizeCountryList($input['specific_ship_to_countries'] ?? ['IR']),
            'enable_coupons' => filter_var($input['enable_coupons'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'enable_coupon_stacking' => filter_var($input['enable_coupon_stacking'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'calc_taxes' => filter_var($input['calc_taxes'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'currency' => $currency,
            'currency_position' => $pos,
            'thousand_separator' => mb_substr((string) ($input['thousand_separator'] ?? ','), 0, 3),
            'decimal_separator' => mb_substr((string) ($input['decimal_separator'] ?? '.'), 0, 3) ?: '.',
            'price_decimals' => $decimals,
            'shop_page_id' => $shopPageId,
            'cart_redirect_after_add' => filter_var($input['cart_redirect_after_add'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'weight_unit' => $weight,
            'dimension_unit' => $dim,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitizeProducts(array $input): array
    {
        $d = self::productsDefaults();
        $hold = $input['hold_stock_minutes'] ?? $d['hold_stock_minutes'];
        $holdMinutes = ($hold === '' || $hold === null) ? null : max(0, (int) $hold);

        $format = (string) ($input['stock_format'] ?? $d['stock_format']);
        if (! in_array($format, ['', 'low_amount', 'always'], true)) {
            $format = 'low_amount';
        }

        return [
            'manage_stock' => filter_var($input['manage_stock'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'hold_stock_minutes' => $holdMinutes,
            'notify_low_stock' => filter_var($input['notify_low_stock'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'notify_no_stock' => filter_var($input['notify_no_stock'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'stock_email_recipient' => mb_substr(trim((string) ($input['stock_email_recipient'] ?? '')), 0, 255),
            'low_stock_threshold' => max(0, (int) ($input['low_stock_threshold'] ?? $d['low_stock_threshold'])),
            'no_stock_threshold' => max(0, (int) ($input['no_stock_threshold'] ?? $d['no_stock_threshold'])),
            'hide_out_of_stock' => filter_var($input['hide_out_of_stock'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'stock_format' => $format,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitizeTax(array $input): array
    {
        $d = self::taxDefaults();
        $basedOn = (string) ($input['tax_based_on'] ?? $d['tax_based_on']);
        if (! in_array($basedOn, ['shipping', 'billing', 'base'], true)) {
            $basedOn = 'shipping';
        }
        $displayShop = (string) ($input['display_shop'] ?? $d['display_shop']);
        if (! in_array($displayShop, ['incl', 'excl'], true)) {
            $displayShop = 'excl';
        }
        $displayCart = (string) ($input['display_cart'] ?? $d['display_cart']);
        if (! in_array($displayCart, ['incl', 'excl'], true)) {
            $displayCart = 'excl';
        }
        $rate = (float) ($input['rate_percent'] ?? $d['rate_percent']);
        $rate = max(0, min(100, $rate));

        return [
            'enabled' => filter_var($input['enabled'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'rate_percent' => $rate,
            'prices_include_tax' => filter_var($input['prices_include_tax'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'tax_based_on' => $basedOn,
            'round_at_subtotal' => filter_var($input['round_at_subtotal'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'display_shop' => $displayShop,
            'display_cart' => $displayCart,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitizeAdvanced(array $input): array
    {
        return [
            'cart_page_id' => self::nullablePositiveInt($input['cart_page_id'] ?? null),
            'checkout_page_id' => self::nullablePositiveInt($input['checkout_page_id'] ?? null),
            'myaccount_page_id' => self::nullablePositiveInt($input['myaccount_page_id'] ?? null),
            'terms_page_id' => self::nullablePositiveInt($input['terms_page_id'] ?? null),
            'force_ssl_checkout' => filter_var($input['force_ssl_checkout'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'debug_mode' => filter_var($input['debug_mode'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'debug_log_enabled' => filter_var($input['debug_log_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitizeDownloads(array $input): array
    {
        $method = (string) ($input['delivery_method'] ?? 'force');
        if (! in_array($method, ['force', 'redirect'], true)) {
            $method = 'force';
        }
        // External redirect is never allowed; force keeps files behind the controller.
        if ($method === 'redirect' && ! filter_var($input['allow_external_redirect'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $method = 'force';
        }

        return [
            'delivery_method' => $method,
            'x_accel_prefix' => mb_substr(trim((string) ($input['x_accel_prefix'] ?? '')), 0, 120),
            'require_login' => filter_var($input['require_login'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'count_downloads' => filter_var($input['count_downloads'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'allow_external_redirect' => false,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitizeReviews(array $input): array
    {
        return [
            'enabled' => filter_var($input['enabled'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'verified_buyer_only' => filter_var($input['verified_buyer_only'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'require_approval' => filter_var($input['require_approval'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'show_average' => filter_var($input['show_average'] ?? true, FILTER_VALIDATE_BOOLEAN),
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $current
     * @return array<string, mixed>
     */
    public static function sanitizeMaps(array $input, array $current = []): array
    {
        $provider = (string) ($input['provider'] ?? 'neshan');
        if (! in_array($provider, ['neshan', 'mapbox'], true)) {
            $provider = 'neshan';
        }
        $mapType = (string) ($input['map_type'] ?? 'mapboxgl');
        if (! in_array($mapType, ['leaflet', 'mapboxgl'], true)) {
            $mapType = 'mapboxgl';
        }

        return [
            'billing_map_enabled' => filter_var($input['billing_map_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'provider' => $provider,
            'api_key' => self::resolveSecret($input['api_key'] ?? null, (string) ($current['api_key'] ?? '')),
            'service_api_key' => self::resolveSecret($input['service_api_key'] ?? null, (string) ($current['service_api_key'] ?? '')),
            'map_type' => $mapType,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitizeLoyalty(array $input): array
    {
        return [
            'enabled' => filter_var($input['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'point_price_minor' => max(1, (int) ($input['point_price_minor'] ?? 1000)),
            'max_points_per_product' => max(0, (int) ($input['max_points_per_product'] ?? 150)),
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitizeArchive(array $input): array
    {
        $sliderMode = (string) ($input['category_slider_mode'] ?? 'image_title');
        if (! in_array($sliderMode, ['image_title', 'image', 'title'], true)) {
            $sliderMode = 'image_title';
        }
        $placement = (string) ($input['filter_placement'] ?? 'sidebar');
        if (! in_array($placement, ['sidebar', 'header'], true)) {
            $placement = 'sidebar';
        }
        $sort = (string) ($input['default_sort'] ?? 'newest');
        if (! in_array($sort, ['newest', 'price_asc', 'price_desc', 'popular'], true)) {
            $sort = 'newest';
        }

        return [
            'sidebar_enabled' => filter_var($input['sidebar_enabled'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'category_slider' => filter_var($input['category_slider'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'category_slider_mode' => $sliderMode,
            'filter_placement' => $placement,
            'filter_price' => filter_var($input['filter_price'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'filter_in_stock' => filter_var($input['filter_in_stock'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'filter_express' => filter_var($input['filter_express'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'filter_on_sale' => filter_var($input['filter_on_sale'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'filter_color' => filter_var($input['filter_color'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'filters_open_default' => filter_var($input['filters_open_default'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'products_per_page' => max(1, min(96, (int) ($input['products_per_page'] ?? 12))),
            'product_columns' => max(1, min(6, (int) ($input['product_columns'] ?? 3))),
            'default_sort' => $sort,
        ];
    }

    /**
     * Format a major-unit amount using shop currency display settings.
     *
     * @param  array<string, mixed>  $general
     */
    public static function formatPrice(float|int|string $amount, array $general): string
    {
        $decimals = max(0, min(6, (int) ($general['price_decimals'] ?? 0)));
        $thousand = (string) ($general['thousand_separator'] ?? ',');
        $decimal = (string) ($general['decimal_separator'] ?? '.');
        $currency = (string) ($general['currency'] ?? 'IRR');
        $pos = (string) ($general['currency_position'] ?? 'left');

        $num = number_format((float) $amount, $decimals, $decimal, $thousand);

        return match ($pos) {
            'right' => $num.$currency,
            'left_space' => $currency.' '.$num,
            'right_space' => $num.' '.$currency,
            default => $currency.$num,
        };
    }

    private static function resolveSecret(mixed $incoming, string $current): string
    {
        if ($incoming === null) {
            return $current;
        }
        $v = trim((string) $incoming);
        if ($v === '' || str_contains($v, '*')) {
            return $current;
        }

        return mb_substr($v, 0, 255);
    }

    private static function nullablePositiveInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        $n = (int) $value;

        return $n > 0 ? $n : null;
    }

    /**
     * @param  mixed  $list
     * @return list<string>
     */
    private static function sanitizeCountryList(mixed $list): array
    {
        if (! is_array($list)) {
            return ['IR'];
        }
        $out = [];
        foreach ($list as $code) {
            $c = strtoupper(substr(trim((string) $code), 0, 2));
            if ($c !== '' && in_array($c, self::allowedCountryCodes(), true) && ! in_array($c, $out, true)) {
                $out[] = $c;
            }
        }

        return $out !== [] ? $out : ['IR'];
    }
}
