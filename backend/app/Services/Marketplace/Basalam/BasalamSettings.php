<?php

namespace App\Services\Marketplace\Basalam;

use App\Services\Marketplace\MarketplaceSettingsService;

/**
 * Basalam engine settings (port of WebinoBasalam SettingsConfig) and Basalam Pay gateway settings.
 * Tokens live in `marketplace.basalam.credentials`; runtime values in `marketplace.state.basalam`.
 */
class BasalamSettings
{
    public const ENGINE_BUCKET = 'basalam.engine';

    public const GATEWAY_BUCKET = 'basalam.gateway';

    /** @var array<string, array{0: string, 1: mixed}> key => [type, default] */
    public const ENGINE = [
        'default_weight' => ['int', 100],
        'default_package_weight' => ['int', 50],
        'default_preparation' => ['int', 1],
        'default_stock_quantity' => ['int', 1],
        'sync_status_product' => ['bool', false],
        'sync_status_order' => ['bool', false],
        'developer_mode' => ['bool', false],
        'price_change_value' => ['price_change', '0'],
        'round_price' => ['enum:none,up,down', 'none'],
        'product_prefix_title' => ['string', ''],
        'product_suffix_title' => ['string', ''],
        'sync_product_fields' => ['enum:all,price_stock,custom', 'all'],
        'sync_product_field_name' => ['bool', false],
        'sync_product_field_photos' => ['bool', false],
        'sync_product_field_price' => ['bool', false],
        'sync_product_field_stock' => ['bool', false],
        'sync_product_field_weight' => ['bool', true],
        'sync_product_field_description' => ['bool', false],
        'sync_product_field_attr' => ['bool', false],
        'sync_product_field_video' => ['bool', false],
        'sync_product_field_variant_price' => ['bool', false],
        'sync_product_field_variant_stock' => ['bool', false],
        'auto_confirm_order' => ['bool', false],
        'all_products_wholesale' => ['enum:none,all', 'none'],
        'add_attr_to_desc_product' => ['bool', false],
        'add_short_desc_to_desc_product' => ['bool', false],
        'add_full_desc_to_desc_product' => ['bool', true],
        'product_price_field' => ['enum:original_price,sale_price,sale_strikethrough_price', 'original_price'],
        'order_statues_type' => ['enum:basalam_statuses,woocommerce_statuses', 'basalam_statuses'],
        'discount_duration' => ['int', 20],
        'discount_reduction_percent' => ['float', 0],
        'tasks_per_minute' => ['int', 20],
        'tasks_per_minute_auto' => ['bool', true],
        'product_attribute_suffix_enabled' => ['bool', false],
        'product_attribute_suffix_priority' => ['string', ''],
        'safe_stock' => ['int', 0],
        'variable_product_stock_source' => ['enum:variation,product', 'variation'],
        'order_shipping_method' => ['string', 'basalam'],
        'customer_prefix_name' => ['string', ''],
        'customer_suffix_name' => ['string', ''],
        'video_source' => ['enum:plugin_box,inherit', 'plugin_box'],
        'video_inherit_mode' => ['enum:auto,manual', 'auto'],
        'video_meta_key' => ['string', ''],
        'cap_preparation_to_category_max' => ['bool', true],
        'chat_notify_admins' => ['bool', true],
    ];

    /** Fields selectable in "custom" update mode. */
    public const CUSTOM_UPDATE_FIELDS = [
        'sync_product_field_name',
        'sync_product_field_photos',
        'sync_product_field_price',
        'sync_product_field_stock',
        'sync_product_field_weight',
        'sync_product_field_description',
        'sync_product_field_attr',
        'sync_product_field_video',
        'sync_product_field_variant_price',
        'sync_product_field_variant_stock',
    ];

    public const COMMISSION = 'commission';

    public function __construct(protected MarketplaceSettingsService $settings) {}

    /** @return array<string, mixed> */
    public static function engineDefaults(): array
    {
        return array_map(fn ($row) => $row[1], self::ENGINE);
    }

    /** @return array<string, mixed> */
    public function engine(int $tenantId): array
    {
        $stored = $this->settings->bucket($tenantId, self::ENGINE_BUCKET);
        $out = [];
        foreach (self::ENGINE as $key => [$type, $default]) {
            $out[$key] = array_key_exists($key, $stored) ? self::coerce($type, $stored[$key], $default) : $default;
        }

        return $out;
    }

    public function get(int $tenantId, string $key): mixed
    {
        return $this->engine($tenantId)[$key] ?? null;
    }

    /**
     * @param  array<string, mixed>  $patch
     * @return array<string, mixed>
     */
    public function saveEngine(int $tenantId, array $patch): array
    {
        $current = $this->engine($tenantId);
        foreach ($patch as $key => $value) {
            if (! isset(self::ENGINE[$key])) {
                continue;
            }
            [$type, $default] = self::ENGINE[$key];
            $current[$key] = self::coerce($type, $value, $current[$key] ?? $default);
        }
        $this->settings->putBucket($tenantId, self::ENGINE_BUCKET, $current);

        return $current;
    }

    public static function coerce(string $type, mixed $value, mixed $fallback): mixed
    {
        if (str_starts_with($type, 'enum:')) {
            $allowed = explode(',', substr($type, 5));
            if ($value === true || $value === 'yes') {
                $value = $allowed[1] ?? $allowed[0];
            }
            if ($value === false || $value === 'no') {
                $value = $allowed[0];
            }

            return in_array((string) $value, $allowed, true) ? (string) $value : $fallback;
        }

        return match ($type) {
            'bool' => is_bool($value) ? $value : in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on', 'all'], true),
            'int' => is_numeric($value) ? max(0, (int) $value) : $fallback,
            'float' => is_numeric($value) ? (float) $value : $fallback,
            'price_change' => self::normalizePriceChange($value),
            default => $value === null ? '' : mb_substr(trim((string) $value), 0, 191),
        };
    }

    /**
     * `commission`, a percent in −100..100 clamped to ±35, or a toman amount outside that range
     * (WordPress PriceAdjustment).
     */
    public static function normalizePriceChange(mixed $value): string
    {
        if (is_string($value) && strtolower(trim($value)) === self::COMMISSION) {
            return self::COMMISSION;
        }
        if (! is_numeric($value)) {
            return '0';
        }
        $n = (int) $value;
        if ($n >= -100 && $n <= 100) {
            $n = max(-35, min(35, $n));
        }

        return (string) $n;
    }

    public static function isPercentChange(string $value): bool
    {
        return is_numeric($value) && (int) $value >= -100 && (int) $value <= 100;
    }

    public static function isCommission(mixed $value): bool
    {
        return is_string($value) && $value === self::COMMISSION;
    }

    /** @return array{gateway_sandbox: bool, pay_api_base: string, has_gateway_secret: bool, has_gateway_sandbox_token: bool} */
    public function gatewayPublic(int $tenantId): array
    {
        $g = $this->gateway($tenantId);

        return [
            'gateway_sandbox' => $g['gateway_sandbox'],
            'pay_api_base' => $g['pay_api_base'],
            'has_gateway_secret' => $g['gateway_secret'] !== '',
            'has_gateway_sandbox_token' => $g['gateway_sandbox_token'] !== '',
        ];
    }

    /** @return array{gateway_secret: string, gateway_sandbox: bool, gateway_sandbox_token: string, pay_api_base: string} */
    public function gateway(int $tenantId): array
    {
        $stored = $this->settings->bucket($tenantId, self::GATEWAY_BUCKET);
        $creds = $this->settings->credentials($tenantId, 'basalam');

        return [
            'gateway_secret' => (string) (($creds['gateway_secret'] ?? '') ?: ''),
            'gateway_sandbox' => (bool) ($stored['gateway_sandbox'] ?? false),
            'gateway_sandbox_token' => (string) ($stored['gateway_sandbox_token'] ?? ''),
            'pay_api_base' => (string) (($stored['pay_api_base'] ?? '') ?: BasalamEndpoints::OPENAPI_BASE),
        ];
    }

    /** @param  array<string, mixed>  $data */
    public function saveGateway(int $tenantId, array $data): array
    {
        $stored = $this->settings->bucket($tenantId, self::GATEWAY_BUCKET);
        if (array_key_exists('gateway_sandbox', $data)) {
            $stored['gateway_sandbox'] = (bool) $data['gateway_sandbox'];
        }
        if (array_key_exists('gateway_sandbox_token', $data) && self::isNewSecret($data['gateway_sandbox_token'])) {
            $stored['gateway_sandbox_token'] = trim((string) $data['gateway_sandbox_token']);
        }
        if (array_key_exists('pay_api_base', $data)) {
            $base = trim((string) $data['pay_api_base']);
            $stored['pay_api_base'] = filter_var($base, FILTER_VALIDATE_URL) && str_starts_with($base, 'https://') ? rtrim($base, '/') : BasalamEndpoints::OPENAPI_BASE;
        }
        $this->settings->putBucket($tenantId, self::GATEWAY_BUCKET, $stored);
        if (array_key_exists('gateway_secret', $data) && self::isNewSecret($data['gateway_secret'])) {
            $this->settings->patchCredentials($tenantId, 'basalam', ['gateway_secret' => trim((string) $data['gateway_secret'])]);
        }
        foreach ((array) ($data['clear_secrets'] ?? []) as $key) {
            if ($key === 'gateway_secret') {
                $this->settings->patchCredentials($tenantId, 'basalam', ['gateway_secret' => '']);
            }
            if ($key === 'gateway_sandbox_token') {
                $stored['gateway_sandbox_token'] = '';
                $this->settings->putBucket($tenantId, self::GATEWAY_BUCKET, $stored);
            }
        }

        return $this->gatewayPublic($tenantId);
    }

    public static function isNewSecret(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '' && ! str_contains($value, '•') && trim($value) !== '***';
    }
}
