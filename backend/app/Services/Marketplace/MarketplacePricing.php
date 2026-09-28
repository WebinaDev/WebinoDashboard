<?php

namespace App\Services\Marketplace;

use App\Models\PricingSetting;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Tenant;
use App\Services\Pricing\PricingCalculator;

/**
 * Per-platform price/stock resolution (port of WNC_Pricing + WFCP platform settings).
 *
 * Order: locked manual platform price → purchase-based markup (when enabled) → store selling price.
 * Results are returned in the platform's remote unit (toman or rial).
 */
class MarketplacePricing
{
    /** @var array<int, self> */
    protected static array $cache = [];

    protected ?PricingCalculator $calculator = null;

    /** @param  array<string, mixed>  $payload */
    public function __construct(
        protected int $tenantId,
        protected array $payload,
        protected string $storeCurrency,
    ) {}

    public static function forTenant(int $tenantId): self
    {
        $row = PricingSetting::query()->where('tenant_id', $tenantId)->first();
        $currency = (string) (Tenant::query()->whereKey($tenantId)->value('default_currency') ?: 'IRT');

        return new self($tenantId, $row?->payload ?? PricingCalculator::defaultSettings(), strtoupper($currency));
    }

    public function calculator(): PricingCalculator
    {
        return $this->calculator ??= new PricingCalculator($this->payload);
    }

    /** @return array<string, mixed> */
    public static function platformDefaults(string $platform): array
    {
        $feed = MarketplacePlatforms::isFeed($platform);

        return [
            'enabled' => false,
            'profit_percent' => 20,
            'extra_percent' => 0,
            'round_enabled' => true,
            'round_to' => 1000,
            'price_unit' => MarketplacePlatforms::CATALOG[$platform]['default_unit'] ?? 'toman',
            'price_mode' => $feed ? 'retail' : 'markup',
            'use_sale_price' => true,
        ];
    }

    /** @return array<string, array<string, mixed>> */
    public function allPlatformSettings(): array
    {
        $out = [];
        foreach (MarketplacePlatforms::slugs() as $slug) {
            $out[$slug] = $this->platformSettings($slug);
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public function platformSettings(string $platform): array
    {
        $stored = $this->payload['platforms'][$platform] ?? [];

        return array_merge(self::platformDefaults($platform), is_array($stored) ? $stored : []);
    }

    /** @param  array<string, array<string, mixed>>  $platforms */
    public static function savePlatformSettings(int $tenantId, array $platforms): array
    {
        $row = PricingSetting::query()->firstOrCreate(
            ['tenant_id' => $tenantId],
            ['payload' => PricingCalculator::defaultSettings()]
        );
        $payload = $row->payload ?? [];
        $current = is_array($payload['platforms'] ?? null) ? $payload['platforms'] : [];
        foreach ($platforms as $slug => $cfg) {
            if (! MarketplacePlatforms::exists($slug) || ! is_array($cfg)) {
                continue;
            }
            $current[$slug] = [
                'enabled' => (bool) ($cfg['enabled'] ?? false),
                'profit_percent' => (float) ($cfg['profit_percent'] ?? 20),
                'extra_percent' => (float) ($cfg['extra_percent'] ?? 0),
                'round_enabled' => PricingCalculator::bool($cfg['round_enabled'] ?? true),
                'round_to' => max(1, (int) ($cfg['round_to'] ?? 1000)),
                'price_unit' => in_array($cfg['price_unit'] ?? null, ['rial', 'toman'], true) ? $cfg['price_unit'] : self::platformDefaults($slug)['price_unit'],
                'price_mode' => in_array($cfg['price_mode'] ?? null, ['retail', 'markup'], true) ? $cfg['price_mode'] : self::platformDefaults($slug)['price_mode'],
                'use_sale_price' => (bool) ($cfg['use_sale_price'] ?? true),
            ];
        }
        $payload['platforms'] = $current;
        $row->update(['payload' => $payload]);

        return (new self($tenantId, $payload, 'IRT'))->allPlatformSettings();
    }

    public function unit(string $platform): string
    {
        return (string) $this->platformSettings($platform)['price_unit'];
    }

    public function storeCurrency(): string
    {
        return $this->storeCurrency;
    }

    /** Convert an amount in store currency to the platform's remote unit. */
    public function toRemote(float $amount, string $platform, ?string $currency = null): int
    {
        $rial = $this->toRial($amount, $currency);

        return (int) round($this->unit($platform) === 'rial' ? $rial : $rial / 10);
    }

    /** Convert a remote amount back to store currency. */
    public function fromRemote(float $amount, string $platform): int
    {
        $rial = $this->unit($platform) === 'rial' ? $amount : $amount * 10;

        return (int) round($this->storeCurrency === 'IRT' ? $rial / 10 : $rial);
    }

    public function toRial(float $amount, ?string $currency = null): float
    {
        $cur = strtoupper($currency ?: $this->storeCurrency);

        return $cur === 'IRT' ? $amount * 10 : $amount;
    }

    /** Store-currency selling price used when no markup applies. */
    public function sellingPrice(Product $product, ?ProductVariant $variant, bool $useSale = true): int
    {
        return $useSale ? $product->effectivePriceMinor($variant) : $product->regularPriceMinor($variant);
    }

    /** @return array{price: float, locked: bool}|null */
    public function manualPrice(Product $product, ?ProductVariant $variant, string $platform): ?array
    {
        foreach ([$variant, $product] as $src) {
            if (! $src) {
                continue;
            }
            $entry = ($src->platform_prices ?? [])[$platform] ?? null;
            if (is_numeric($entry) && (float) $entry > 0) {
                return ['price' => (float) $entry, 'locked' => true];
            }
            if (is_array($entry) && ! empty($entry['lock']) && isset($entry['price']) && is_numeric($entry['price']) && (float) $entry['price'] > 0) {
                return ['price' => (float) $entry['price'], 'locked' => true];
            }
        }

        return null;
    }

    /** Price in store currency before unit conversion. */
    public function storePrice(Product $product, ?ProductVariant $variant, string $platform): float
    {
        $manual = $this->manualPrice($product, $variant, $platform);
        if ($manual) {
            return $manual['price'];
        }

        $cfg = $this->platformSettings($platform);
        $purchase = (float) (($variant?->purchase_price_minor) ?: $product->purchase_price_minor ?: 0);
        if (! empty($cfg['enabled']) && $purchase > 0) {
            return $this->calculator()->channel($purchase, $platform, $variant ?? $product);
        }

        return (float) $this->sellingPrice($product, $variant, (bool) ($cfg['use_sale_price'] ?? true));
    }

    /** Final integer price in the platform's remote unit. */
    public function priceFor(Product $product, ?ProductVariant $variant, string $platform): int
    {
        return $this->toRemote($this->storePrice($product, $variant, $platform), $platform, $product->currency ?: null);
    }

    public function stockFor(Product $product, ?ProductVariant $variant = null): int
    {
        $src = $variant ?? $product;
        $manage = $variant ? ($variant->manage_stock ?? $product->manage_stock) : $product->manage_stock;
        if (! $manage) {
            $status = (string) ($src->stock_status ?: $product->stock_status ?: 'instock');

            return $status === 'outofstock' ? 0 : 1;
        }

        return max(0, (int) ($src->stock ?? 0));
    }

    /** @return array<string, mixed> */
    public function preview(Product $product, ?ProductVariant $variant = null): array
    {
        $rows = [];
        foreach (MarketplacePlatforms::slugs() as $slug) {
            $rows[$slug] = [
                'store_price' => (int) round($this->storePrice($product, $variant, $slug)),
                'remote_price' => $this->priceFor($product, $variant, $slug),
                'unit' => $this->unit($slug),
                'locked' => $this->manualPrice($product, $variant, $slug) !== null,
            ];
        }

        return [
            'currency' => $this->storeCurrency,
            'stock' => $this->stockFor($product, $variant),
            'platforms' => $rows,
        ];
    }
}
