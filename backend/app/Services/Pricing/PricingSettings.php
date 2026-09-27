<?php

namespace App\Services\Pricing;

use App\Models\PricingSetting;
use App\Services\Marketplace\MarketplacePlatforms;
use Illuminate\Validation\ValidationException;

/**
 * Section-based WFCP settings storage (port of WFCP_Admin::sanitize_settings_data).
 */
class PricingSettings
{
    public const SECTIONS = ['general', 'exchange', 'retail', 'credit', 'installment', 'wholesale', 'notifications', 'style', 'reference'];

    public static function row(int $tenantId): PricingSetting
    {
        return PricingSetting::query()->firstOrCreate(
            ['tenant_id' => $tenantId],
            ['payload' => PricingCalculator::defaultSettings()]
        );
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId): array
    {
        $calc = new PricingCalculator(self::row($tenantId)->payload ?? []);
        $out = $calc->settings();
        $channels = [];
        foreach (MarketplacePlatforms::slugs() as $slug) {
            $channels[$slug] = $calc->channelSettings($slug);
        }
        $out['platforms'] = $channels;

        return $out;
    }

    public static function storageKey(string $section): string
    {
        return match ($section) {
            'exchange', 'currency' => 'general',
            default => $section,
        };
    }

    public static function valid(string $section): bool
    {
        return in_array($section, self::SECTIONS, true) || $section === 'currency' || MarketplacePlatforms::exists($section);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed> Full merged settings
     */
    public static function saveSection(int $tenantId, string $section, array $data): array
    {
        if (! self::valid($section)) {
            throw ValidationException::withMessages(['section' => __('Unknown pricing settings section.')]);
        }
        $row = self::row($tenantId);
        $payload = is_array($row->payload) ? $row->payload : [];
        $calc = new PricingCalculator($payload);

        if (MarketplacePlatforms::exists($section)) {
            $payload['platforms'] = is_array($payload['platforms'] ?? null) ? $payload['platforms'] : [];
            $payload['platforms'][$section] = self::sanitizeChannel($section, $data, $calc->channelSettings($section));
        } else {
            $key = self::storageKey($section);
            $payload[$key] = self::sanitize($section, $data, $calc->section($key), $calc);
        }

        $row->update(['payload' => $payload]);

        return self::get($tenantId);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public static function import(int $tenantId, array $data): array
    {
        foreach ($data as $section => $values) {
            if (! is_array($values)) {
                continue;
            }
            if ($section === 'platforms') {
                foreach ($values as $slug => $cfg) {
                    if (is_string($slug) && MarketplacePlatforms::exists($slug) && is_array($cfg)) {
                        self::saveSection($tenantId, $slug, $cfg);
                    }
                }

                continue;
            }
            if (is_string($section) && self::valid($section)) {
                self::saveSection($tenantId, $section, $values);
            }
        }

        return self::get($tenantId);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $current
     * @return array<string, mixed>
     */
    public static function sanitize(string $section, array $data, array $current, PricingCalculator $calc): array
    {
        $b = fn (string $k) => PricingCalculator::bool($data[$k]);
        $has = fn (string $k) => array_key_exists($k, $data) && $data[$k] !== null;

        switch ($section) {
            case 'general':
                if ($has('enabled')) {
                    $current['enabled'] = $b('enabled');
                }
                if ($has('exchange_rate')) {
                    $current['exchange_rate'] = self::price($data['exchange_rate']);
                }
                if ($has('default_purchase_type')) {
                    $type = (string) $data['default_purchase_type'];
                    $type = $type === 'retail' ? 'cash' : $type;
                    if (! in_array($type, ['cash', 'credit', 'installment'], true) || ! $calc->typeEnabled($type)) {
                        $type = 'cash';
                    }
                    $current['default_purchase_type'] = $type;
                }

                return $current;

            case 'exchange':
                if ($has('exchange_rate')) {
                    $current['exchange_rate'] = self::price($data['exchange_rate']);
                }
                foreach (['exchange_rate_enabled', 'api_enabled', 'auto_update_enabled', 'enabled'] as $k) {
                    if ($has($k)) {
                        $current[$k] = $b($k);
                    }
                }
                if ($has('purchase_currency') && in_array($data['purchase_currency'], ['base', 'display'], true)) {
                    $current['purchase_currency'] = $data['purchase_currency'];
                }
                if ($has('api_key')) {
                    $current['api_key'] = trim((string) $data['api_key']);
                }
                if ($has('api_symbol')) {
                    $current['api_symbol'] = strtoupper(trim((string) $data['api_symbol'])) ?: 'USD';
                }
                if ($has('auto_update_hour')) {
                    $current['auto_update_hour'] = max(0, min(23, (int) $data['auto_update_hour']));
                }

                return $current;

            case 'currency':
                return $current;

            case 'retail':
                if ($has('profit_percent')) {
                    $current['profit_percent'] = (float) $data['profit_percent'];
                }
                self::rounding($data, $current);
                self::gateways($data, $current);

                return $current;

            case 'credit':
                if ($has('enabled')) {
                    $current['enabled'] = $b('enabled');
                }
                if ($has('increase_percent')) {
                    $current['increase_percent'] = (float) $data['increase_percent'];
                }
                self::gateways($data, $current);
                self::texts($data, $current);

                return $current;

            case 'installment':
                if ($has('enabled')) {
                    $current['enabled'] = $b('enabled');
                }
                self::rounding($data, $current);
                if (array_key_exists('plans', $data) && is_array($data['plans'])) {
                    $plans = [];
                    foreach ($data['plans'] as $plan) {
                        if (! is_array($plan)) {
                            continue;
                        }
                        $plans[] = [
                            'months' => (int) ($plan['months'] ?? 0),
                            'interest' => (float) ($plan['interest'] ?? 0),
                        ];
                    }
                    $current['plans'] = $plans;
                }
                self::gateways($data, $current);
                if ($has('pdp_theme')) {
                    $current['pdp_theme'] = $data['pdp_theme'] === 'timeline' ? 'timeline' : 'classic';
                }
                if ($has('gateway_logos_only')) {
                    $current['gateway_logos_only'] = $b('gateway_logos_only');
                }
                self::texts($data, $current);

                return $current;

            case 'wholesale':
                if ($has('enabled')) {
                    $current['enabled'] = $b('enabled');
                }
                if ($has('strategy')) {
                    $current['strategy'] = (string) $data['strategy'];
                }
                if ($has('discount_percent')) {
                    $current['discount_percent'] = (float) $data['discount_percent'];
                }
                self::gateways($data, $current);
                if (array_key_exists('shipping_methods', $data)) {
                    $current['shipping_methods'] = self::ids($data['shipping_methods']);
                }
                if (array_key_exists('category_rules', $data) && is_array($data['category_rules'])) {
                    $rules = [];
                    foreach ($data['category_rules'] as $catId => $discount) {
                        if (is_array($discount)) {
                            $catId = $discount['category_id'] ?? $discount['id'] ?? $catId;
                            $discount = $discount['discount_percent'] ?? $discount['discount'] ?? 0;
                        }
                        if ((int) $catId > 0) {
                            $rules[(int) $catId] = (float) $discount;
                        }
                    }
                    $current['category_rules'] = $rules;
                }
                foreach (['threshold_enabled', 'partner_enabled'] as $k) {
                    if ($has($k)) {
                        $current[$k] = $b($k);
                    } elseif ($has('strategy') || $has('enabled')) {
                        $current[$k] = false;
                    }
                }
                foreach (['partner_only', 'hide_retail_from_partner'] as $k) {
                    if ($has($k)) {
                        $current[$k] = $b($k);
                    }
                }
                if (is_array($data['defaults'] ?? null)) {
                    $prev = is_array($current['defaults'] ?? null) ? $current['defaults'] : [];
                    foreach (['min_qty', 'min_weight', 'qty_step'] as $k) {
                        if (isset($data['defaults'][$k])) {
                            $prev[$k] = max(0, (float) $data['defaults'][$k]);
                        }
                    }
                    if (isset($data['defaults']['min_distinct_skus'])) {
                        $prev['min_distinct_skus'] = max(0, (int) $data['defaults']['min_distinct_skus']);
                    }
                    $current['defaults'] = $prev;
                }
                if (array_key_exists('category_variety_rules', $data) && is_array($data['category_variety_rules'])) {
                    $rules = [];
                    foreach ($data['category_variety_rules'] as $catId => $need) {
                        $rules[(int) $catId] = max(0, (int) $need);
                    }
                    $current['category_variety_rules'] = $rules;
                }

                return $current;

            case 'notifications':
                foreach (['installment_text', 'credit_text', 'need_review', 'custom_cash_label', 'custom_install_label', 'guaranty_text'] as $k) {
                    if ($has($k)) {
                        $current[$k] = trim(strip_tags((string) $data[$k]));
                    }
                }
                foreach (['cash_description', 'installment_description', 'credit_description', 'wholesale_description'] as $k) {
                    if ($has($k)) {
                        $current[$k] = strip_tags((string) $data[$k], '<p><br><strong><b><em><i><ul><ol><li><a><span>');
                    }
                }
                foreach (['alert_product_text', 'alert_cart_text', 'alert_checkout_text'] as $k) {
                    if ($has($k)) {
                        $current[$k] = strip_tags((string) $data[$k]);
                    }
                }
                foreach (['show_cash_badge', 'show_install_badge', 'show_credit_badge', 'show_guaranty_label', 'alert_product_enabled', 'alert_cart_enabled', 'alert_checkout_enabled'] as $k) {
                    if ($has($k)) {
                        $current[$k] = $b($k);
                    }
                }

                return $current;

            case 'style':
                foreach (['price_color', 'box_background', 'box_border_color', 'button_background', 'button_text_color'] as $k) {
                    if ($has($k) && preg_match('/^#[0-9a-fA-F]{3,8}$/', (string) $data[$k])) {
                        $current[$k] = (string) $data[$k];
                    }
                }
                if ($has('border_radius')) {
                    $current['border_radius'] = max(0, min(48, (int) $data['border_radius']));
                }
                foreach (['show_purchase_types', 'show_installment_table'] as $k) {
                    if ($has($k)) {
                        $current[$k] = $b($k);
                    }
                }
                if ($has('placement') && in_array($data['placement'], ['summary', 'before_cart', 'after_cart', 'before_tabs', 'after_tabs', 'none'], true)) {
                    $current['placement'] = $data['placement'];
                }

                return $current;

            case 'reference':
                foreach (['enabled', 'sync_stock', 'sync_stock_when_locked'] as $k) {
                    if ($has($k)) {
                        $current[$k] = $b($k);
                    }
                }
                if (is_array($data['sources'] ?? null)) {
                    $sources = is_array($current['sources'] ?? null) ? $current['sources'] : [];
                    foreach (ReferencePriceService::SOURCES as $src) {
                        if (array_key_exists($src, $data['sources'])) {
                            $sources[$src] = PricingCalculator::bool($data['sources'][$src]);
                        }
                    }
                    $current['sources'] = $sources;
                }

                return $current;
        }

        return $current;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $current
     * @return array<string, mixed>
     */
    public static function sanitizeChannel(string $platform, array $data, array $current): array
    {
        foreach (['enabled', 'round_enabled', 'use_sale_price'] as $k) {
            if (array_key_exists($k, $data)) {
                $current[$k] = PricingCalculator::bool($data[$k]);
            }
        }
        foreach (['profit_percent', 'extra_percent'] as $k) {
            if (isset($data[$k])) {
                $current[$k] = (float) $data[$k];
            }
        }
        if (isset($data['round_to'])) {
            $current['round_to'] = max(1, (int) $data['round_to']);
        }
        if (in_array($data['price_unit'] ?? null, ['toman', 'rial'], true)) {
            $current['price_unit'] = $data['price_unit'];
        }
        if (in_array($data['price_mode'] ?? null, ['retail', 'markup'], true)) {
            $current['price_mode'] = $data['price_mode'];
        }

        return $current;
    }

    /** @param array<string, mixed> $data @param array<string, mixed> $current */
    protected static function rounding(array $data, array &$current): void
    {
        if (array_key_exists('round_enabled', $data)) {
            $current['round_enabled'] = PricingCalculator::bool($data['round_enabled']);
        }
        if (isset($data['round_to'])) {
            $current['round_to'] = max(1, (int) $data['round_to']);
        }
    }

    /** @param array<string, mixed> $data @param array<string, mixed> $current */
    protected static function gateways(array $data, array &$current): void
    {
        if (array_key_exists('gateways', $data)) {
            $current['gateways'] = self::ids($data['gateways']);
        }
    }

    /** @param array<string, mixed> $data @param array<string, mixed> $current */
    protected static function texts(array $data, array &$current): void
    {
        if (! is_array($data['texts'] ?? null)) {
            return;
        }
        $texts = is_array($current['texts'] ?? null) ? $current['texts'] : [];
        foreach (['title', 'button_text'] as $k) {
            if (isset($data['texts'][$k])) {
                $texts[$k] = trim(strip_tags((string) $data['texts'][$k]));
            }
        }
        $current['texts'] = $texts;
    }

    /** @return list<string> */
    protected static function ids(mixed $raw): array
    {
        if (is_string($raw)) {
            $raw = explode(',', $raw);
        }
        $out = [];
        foreach ((array) $raw as $id) {
            $id = preg_replace('/[^A-Za-z0-9_\-]/', '', (string) $id);
            if ($id !== '' && ! in_array($id, $out, true)) {
                $out[] = $id;
            }
        }

        return $out;
    }

    protected static function price(mixed $v): float
    {
        $s = strtr((string) $v, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9', ',' => '', '٬' => '']);

        return max(0, (float) $s);
    }
}
