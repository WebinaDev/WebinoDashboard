<?php

namespace App\Services\Pricing;

use App\Models\PricingSetting;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\MarketplacePlatforms;

/**
 * Port of WFCP_Calculator.
 *
 * Purchase price → (FX when enabled and purchase currency is "base") → retail markup + retail rounding.
 * Credit/installment derive from rounded retail; wholesale discounts the FX price; channels mark up retail.
 */
class PricingCalculator
{
    public const PURCHASE_TYPES = ['cash', 'credit', 'installment', 'wholesale'];

    public const TYPE_SECTION = [
        'cash' => 'retail',
        'retail' => 'retail',
        'credit' => 'credit',
        'installment' => 'installment',
        'wholesale' => 'wholesale',
    ];

    /** @var array<string, mixed> */
    protected array $resolved;

    /** @param array<string, mixed>|null $settings */
    public function __construct(?array $settings = null)
    {
        $this->resolved = self::mergeWithDefaults($settings ?? []);
    }

    public static function forTenant(int $tenantId): self
    {
        $row = PricingSetting::query()->where('tenant_id', $tenantId)->first();

        return new self($row?->payload ?? []);
    }

    /** @return array<string, mixed> */
    public static function defaultSettings(): array
    {
        return [
            'general' => [
                'enabled' => true,
                'exchange_rate' => 1,
                'exchange_rate_enabled' => false,
                'purchase_currency' => 'display',
                'default_purchase_type' => 'cash',
                'api_enabled' => false,
                'api_key' => '',
                'api_symbol' => 'USD',
                'auto_update_enabled' => false,
                'auto_update_hour' => 0,
            ],
            'retail' => [
                'profit_percent' => 20,
                'round_enabled' => true,
                'round_to' => 1000,
                'gateways' => [],
            ],
            'credit' => [
                'enabled' => false,
                'increase_percent' => 5,
                'gateways' => [],
                'texts' => ['title' => 'خرید اعتباری', 'button_text' => 'افزودن اعتباری'],
            ],
            'installment' => [
                'enabled' => false,
                'round_enabled' => true,
                'round_to' => 1000,
                'plans' => [
                    ['months' => 3, 'interest' => 5],
                    ['months' => 6, 'interest' => 10],
                ],
                'gateways' => [],
                'pdp_theme' => 'classic',
                'gateway_logos_only' => true,
                'texts' => ['title' => 'خرید اقساطی', 'button_text' => 'افزودن اقساطی'],
            ],
            'wholesale' => [
                'enabled' => false,
                'strategy' => 'global',
                'discount_percent' => 10,
                'gateways' => [],
                'shipping_methods' => [],
                'category_rules' => [],
                'threshold_enabled' => false,
                'partner_enabled' => false,
                'partner_only' => false,
                'hide_retail_from_partner' => false,
                'defaults' => ['min_qty' => 0, 'min_weight' => 0, 'qty_step' => 0, 'min_distinct_skus' => 0],
                'category_variety_rules' => [],
            ],
            'notifications' => [
                'installment_text' => 'خرید اقساطی',
                'credit_text' => 'خرید اعتباری',
                'cash_description' => '',
                'installment_description' => '',
                'credit_description' => '',
                'wholesale_description' => '',
                'show_cash_badge' => true,
                'custom_cash_label' => '',
                'show_install_badge' => true,
                'custom_install_label' => '',
                'show_credit_badge' => true,
                'show_guaranty_label' => false,
                'guaranty_text' => 'گارانتی ۲۴ ماهه',
                'alert_product_enabled' => true,
                'alert_cart_enabled' => true,
                'alert_checkout_enabled' => true,
                'alert_product_text' => '',
                'alert_cart_text' => '',
                'alert_checkout_text' => '',
            ],
            'style' => [
                'placement' => 'before_cart',
                'show_purchase_types' => true,
                'show_installment_table' => true,
                'price_color' => '#16a34a',
                'border_radius' => 12,
            ],
            'reference' => [
                'enabled' => false,
                'sources' => ['digikala' => true, 'technolife' => true, 'basalam' => true, 'woocommerce' => true],
                'sync_stock' => true,
                'sync_stock_when_locked' => false,
            ],
            'platforms' => [],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function mergeWithDefaults(array $payload): array
    {
        $out = self::defaultSettings();
        foreach ($payload as $key => $value) {
            if (is_array($value) && is_array($out[$key] ?? null)) {
                $out[$key] = array_replace($out[$key], $value);
            } else {
                $out[$key] = $value;
            }
        }
        $cur = (string) ($out['general']['purchase_currency'] ?? 'display');
        if (! in_array($cur, ['base', 'display', ''], true)) {
            $out['general']['purchase_currency'] = 'display';
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public function settings(): array
    {
        return $this->resolved;
    }

    /** @return array<string, mixed> */
    public function section(string $key): array
    {
        return is_array($this->resolved[$key] ?? null) ? $this->resolved[$key] : [];
    }

    /** @return array<string, mixed> */
    public function channelSettings(string $platform): array
    {
        $stored = $this->resolved['platforms'][$platform] ?? [];
        $feed = MarketplacePlatforms::exists($platform) && MarketplacePlatforms::isFeed($platform);

        return array_merge([
            'enabled' => false,
            'profit_percent' => 20,
            'extra_percent' => 0,
            'round_enabled' => true,
            'round_to' => 1000,
            'price_unit' => MarketplacePlatforms::CATALOG[$platform]['default_unit'] ?? 'toman',
            'price_mode' => $feed ? 'retail' : 'markup',
            'use_sale_price' => true,
        ], is_array($stored) ? $stored : []);
    }

    public function fxPrice(float $basePrice): float
    {
        $general = $this->section('general');
        $rate = (float) ($general['exchange_rate'] ?? 0);
        $enabled = self::bool($general['exchange_rate_enabled'] ?? false);
        $cur = (string) ($general['purchase_currency'] ?? 'display');

        if ($enabled && $rate > 0 && ($cur === '' || $cur === 'base')) {
            return $basePrice * $rate;
        }

        return $basePrice;
    }

    /**
     * @param  array{months?: int}  $args
     */
    public function calculate(float $basePrice, string $type = 'retail', array $args = [], Product|ProductVariant|null $context = null): float
    {
        $fx = $this->fxPrice($basePrice);
        $roundedRetail = $this->round($this->retailPrice($fx), 'retail');

        if (MarketplacePlatforms::exists($type)) {
            return $this->channelFromRetail($roundedRetail, $type, $context);
        }

        return match ($type) {
            'credit' => $this->round($this->creditPrice($roundedRetail), 'retail'),
            'installment' => $this->round($this->installmentMonthly($roundedRetail, (int) ($args['months'] ?? $this->defaultInstallmentMonths())), 'installment'),
            'wholesale' => $this->round($this->wholesalePrice($fx, $context), 'retail'),
            default => $roundedRetail,
        };
    }

    /**
     * @return array{retail: float, credit: float, wholesale: float, installment: float, installment_months: int, installments: list<array{months: int, interest: float, monthly: float, total: float}>}
     */
    public function derived(float $purchase, Product|ProductVariant|null $context = null): array
    {
        $months = $this->defaultInstallmentMonths();

        return [
            'retail' => $this->calculate($purchase, 'retail', [], $context),
            'credit' => $this->calculate($purchase, 'credit', [], $context),
            'wholesale' => $this->calculate($purchase, 'wholesale', [], $context),
            'installment' => $this->calculate($purchase, 'installment', ['months' => $months], $context),
            'installment_months' => $months,
            'installments' => $this->installmentTable($purchase, $context),
        ];
    }

    /** @return list<array{months: int, interest: float, monthly: float, total: float}> */
    public function installmentTable(float $purchase, Product|ProductVariant|null $context = null): array
    {
        if (! self::bool($this->section('installment')['enabled'] ?? false)) {
            return [];
        }
        $rows = [];
        foreach ($this->installmentPlans() as $plan) {
            $monthly = $this->calculate($purchase, 'installment', ['months' => $plan['months']], $context);
            $rows[] = [
                'months' => $plan['months'],
                'interest' => $plan['interest'],
                'monthly' => $monthly,
                'total' => $monthly * $plan['months'],
            ];
        }

        return $rows;
    }

    /** @return list<array{months: int, interest: float}> */
    public function installmentPlans(): array
    {
        $plans = [];
        foreach ((array) ($this->section('installment')['plans'] ?? []) as $p) {
            $m = (int) ($p['months'] ?? 0);
            if ($m > 0) {
                $plans[] = ['months' => $m, 'interest' => (float) ($p['interest'] ?? 0)];
            }
        }

        return $plans;
    }

    public function defaultInstallmentMonths(): int
    {
        return $this->installmentPlans()[0]['months'] ?? 3;
    }

    public function typeEnabled(string $type): bool
    {
        return match ($type) {
            'cash', 'retail' => true,
            'credit', 'installment', 'wholesale' => self::bool($this->section($type)['enabled'] ?? false),
            default => false,
        };
    }

    /** @return list<string> */
    public function enabledPurchaseTypes(): array
    {
        return array_values(array_filter(self::PURCHASE_TYPES, fn (string $t) => $this->typeEnabled($t)));
    }

    public function defaultPurchaseType(): string
    {
        $type = (string) ($this->section('general')['default_purchase_type'] ?? 'cash');
        if ($type === 'retail') {
            $type = 'cash';
        }

        return $this->typeEnabled($type) ? $type : 'cash';
    }

    public function normalizePurchaseType(?string $type): string
    {
        $type = $type === 'retail' ? 'cash' : (string) $type;

        return in_array($type, self::PURCHASE_TYPES, true) && $this->typeEnabled($type) ? $type : 'cash';
    }

    /**
     * Allowed gateway ids for a purchase type; empty list means "all gateways".
     *
     * @return list<string>
     */
    public function gatewaysFor(string $type): array
    {
        $section = self::TYPE_SECTION[$type] ?? 'retail';

        return array_values(array_filter(array_map('strval', (array) ($this->section($section)['gateways'] ?? []))));
    }

    public function gatewayAllowed(string $type, string $gateway): bool
    {
        $allowed = $this->gatewaysFor($type);

        return $allowed === [] || in_array($gateway, $allowed, true);
    }

    /**
     * Line unit price (store minor units) for a purchase type — port of WFCP_Cart_Manager price override.
     * Products without a purchase price keep their store price.
     */
    public function unitPrice(Product $product, ?ProductVariant $variant, string $type, int $months = 0): int
    {
        $src = $variant ?? $product;
        $regular = (int) ($src->price_minor ?: $product->price_minor);
        $sale = (int) ($src->sale_price_minor ?? 0);
        $store = ($sale > 0 && $sale < $regular) ? $sale : $regular;

        $purchase = (float) (($variant?->purchase_price_minor) ?: $product->purchase_price_minor ?: 0);
        $type = $this->normalizePurchaseType($type);
        if ($purchase <= 0 || $type === 'cash') {
            return $store;
        }

        $context = $variant ?? $product;
        $price = match ($type) {
            'credit' => $this->calculate($purchase, 'credit', [], $context),
            'installment' => $this->calculate($purchase, 'installment', ['months' => $months > 0 ? $months : $this->defaultInstallmentMonths()], $context)
                * max(1, $months > 0 ? $months : $this->defaultInstallmentMonths()),
            'wholesale' => $this->calculate($purchase, 'wholesale', [], $context),
            default => (float) $store,
        };

        return $price > 0 ? (int) round($price) : $store;
    }

    /**
     * Channel price in store currency from a purchase price (lock/manual → disabled=retail → markup).
     */
    public function channel(float $purchase, string $platform, Product|ProductVariant|null $context = null): float
    {
        return $this->calculate($purchase, $platform, [], $context);
    }

    public function channelFromRetail(float $roundedRetail, string $platform, Product|ProductVariant|null $context = null): float
    {
        $manual = self::manualChannelPrice($context, $platform);
        if ($manual !== null) {
            return $manual;
        }
        $cfg = $this->channelSettings($platform);
        if (! self::bool($cfg['enabled'] ?? false)) {
            return $roundedRetail;
        }
        if (MarketplacePlatforms::isFeed($platform) && ($cfg['price_mode'] ?? 'retail') !== 'markup') {
            return $roundedRetail;
        }
        if (! MarketplacePlatforms::isFeed($platform) && ($cfg['price_mode'] ?? 'markup') === 'retail') {
            return $roundedRetail;
        }

        $price = $roundedRetail;
        $profit = (float) ($cfg['profit_percent'] ?? 0);
        $extra = (float) ($cfg['extra_percent'] ?? 0);
        if ($profit > 0) {
            $price *= 1 + $profit / 100;
        }
        if ($extra > 0) {
            $price *= 1 + $extra / 100;
        }

        return $this->roundWith(max(0, $price), $cfg);
    }

    public static function manualChannelPrice(Product|ProductVariant|null $context, string $platform): ?float
    {
        $sources = [$context];
        if ($context instanceof ProductVariant) {
            $sources[] = $context->product;
        }
        foreach ($sources as $src) {
            if (! $src) {
                continue;
            }
            $entry = ($src->platform_prices ?? [])[$platform] ?? null;
            if (is_numeric($entry) && (float) $entry > 0) {
                return (float) $entry;
            }
            if (is_array($entry) && ! empty($entry['lock']) && isset($entry['price']) && is_numeric($entry['price']) && (float) $entry['price'] > 0) {
                return (float) $entry['price'];
            }
        }

        return null;
    }

    public function wholesaleDiscountPercent(Product|ProductVariant|null $context): float
    {
        $product = $context instanceof ProductVariant ? $context->product : $context;
        foreach ([$context, $context instanceof ProductVariant ? $product : null] as $src) {
            $rule = $src?->wholesale_rule;
            if (is_array($rule) && array_key_exists('discount_percent', $rule) && $rule['discount_percent'] !== null && $rule['discount_percent'] !== '') {
                return (float) $rule['discount_percent'];
            }
        }

        if ($product instanceof Product) {
            $rules = (array) ($this->section('wholesale')['category_rules'] ?? []);
            if ($rules !== []) {
                $ids = $product->relationLoaded('categories')
                    ? $product->categories->pluck('id')->all()
                    : $product->categories()->pluck('categories.id')->all();
                if ($product->category_id) {
                    array_unshift($ids, $product->category_id);
                }
                foreach (array_unique($ids) as $id) {
                    $pct = $rules[$id] ?? $rules[(string) $id] ?? null;
                    if ($pct !== null && (float) $pct > 0) {
                        return (float) $pct;
                    }
                }
            }
        }

        return (float) ($this->section('wholesale')['discount_percent'] ?? 0);
    }

    protected function retailPrice(float $base): float
    {
        $pct = (float) ($this->section('retail')['profit_percent'] ?? 0);

        return $pct > 0 ? $base + ($base * $pct / 100) : $base;
    }

    protected function creditPrice(float $retail): float
    {
        $s = $this->section('credit');
        $pct = (float) ($s['increase_percent'] ?? 0);
        if (! self::bool($s['enabled'] ?? false) || $pct <= 0) {
            return $retail;
        }

        return $retail + ($retail * $pct / 100);
    }

    protected function installmentMonthly(float $retail, int $months): float
    {
        if (! self::bool($this->section('installment')['enabled'] ?? false) || $months <= 0) {
            return $retail;
        }
        $plan = null;
        foreach ($this->installmentPlans() as $p) {
            if ($p['months'] === $months) {
                $plan = $p;
                break;
            }
        }
        if (! $plan) {
            return $retail;
        }

        return ($retail + ($retail * $plan['interest'] / 100)) / $months;
    }

    protected function wholesalePrice(float $fxPrice, Product|ProductVariant|null $context): float
    {
        if (! self::bool($this->section('wholesale')['enabled'] ?? false)) {
            return $fxPrice;
        }
        $pct = $this->wholesaleDiscountPercent($context);
        if ($pct <= 0) {
            return $fxPrice;
        }
        $pct = min($pct, 99.99);

        return max(0, $fxPrice - ($fxPrice * $pct / 100));
    }

    protected function round(float $price, string $section): float
    {
        return $this->roundWith($price, $this->section($section));
    }

    /** @param array<string, mixed> $cfg */
    protected function roundWith(float $price, array $cfg): float
    {
        if (! self::bool($cfg['round_enabled'] ?? true)) {
            return $price;
        }
        $to = max(1, (int) ($cfg['round_to'] ?? 1000) ?: 1000);

        return (float) (round($price / $to) * $to);
    }

    public static function bool(mixed $v): bool
    {
        if (is_string($v)) {
            return in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
        }

        return (bool) $v;
    }
}
