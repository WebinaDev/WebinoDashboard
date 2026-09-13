<?php

namespace App\Services\Pricing;

use App\Models\PricingSetting;

class PricingCalculator
{
    /** @param array<string, mixed>|null $settings */
    public function __construct(
        protected ?array $settings = null,
    ) {}

    public static function forTenant(int $tenantId): self
    {
        $row = PricingSetting::query()->where('tenant_id', $tenantId)->first();

        return new self($row?->payload ?? self::defaultSettings());
    }

    /** @return array<string, mixed> */
    public static function defaultSettings(): array
    {
        return [
            'general' => [
                'exchange_rate' => 1,
                'exchange_rate_enabled' => false,
                'purchase_currency' => 'irr',
            ],
            'retail' => [
                'profit_percent' => 20,
                'round_enabled' => true,
                'round_to' => 1000,
            ],
            'credit' => [
                'enabled' => true,
                'increase_percent' => 10,
                'round_enabled' => true,
                'round_to' => 1000,
            ],
            'installment' => [
                'enabled' => true,
                'increase_percent' => 15,
                'round_enabled' => true,
                'round_to' => 1000,
            ],
            'wholesale' => [
                'enabled' => true,
                'discount_percent' => 5,
                'round_enabled' => true,
                'round_to' => 1000,
            ],
        ];
    }

    /**
     * @param  array{months?: int}  $args
     */
    public function calculate(float $basePrice, string $type = 'retail', array $args = []): float
    {
        $price = $basePrice;
        $general = $this->section('general');
        $rate = (float) ($general['exchange_rate'] ?? 1);
        $fxEnabled = (bool) ($general['exchange_rate_enabled'] ?? false);
        $purchaseCurrency = (string) ($general['purchase_currency'] ?? 'irr');

        if ($fxEnabled && $rate > 0 && ($purchaseCurrency === '' || $purchaseCurrency === 'base')) {
            $price *= $rate;
        }

        $roundedRetail = $this->applySectionRounding($this->retailPrice($price), 'retail');

        return match ($type) {
            'retail' => $roundedRetail,
            'credit' => $this->applySectionRounding($this->creditPrice($roundedRetail), 'credit'),
            'installment' => $this->applySectionRounding(
                $this->installmentPrice($roundedRetail, (int) ($args['months'] ?? 3)),
                'installment'
            ),
            'wholesale' => $this->applySectionRounding($this->wholesalePrice($price), 'wholesale'),
            default => $roundedRetail,
        };
    }

    /** @return array{retail: float, credit: float, wholesale: float, installment: float} */
    public function derived(float $purchase): array
    {
        return [
            'retail' => $this->calculate($purchase, 'retail'),
            'credit' => $this->calculate($purchase, 'credit'),
            'wholesale' => $this->calculate($purchase, 'wholesale'),
            'installment' => $this->calculate($purchase, 'installment', ['months' => 3]),
        ];
    }

    protected function retailPrice(float $base): float
    {
        $pct = (float) ($this->section('retail')['profit_percent'] ?? 0);
        if ($pct <= 0) {
            return $base;
        }

        return $base + ($base * $pct / 100);
    }

    protected function creditPrice(float $retail): float
    {
        $s = $this->section('credit');
        if (! ($s['enabled'] ?? true)) {
            return $retail;
        }
        $pct = (float) ($s['increase_percent'] ?? 0);

        return $pct > 0 ? $retail + ($retail * $pct / 100) : $retail;
    }

    protected function installmentPrice(float $retail, int $months): float
    {
        $s = $this->section('installment');
        if (! ($s['enabled'] ?? true)) {
            return $retail / max(1, $months);
        }
        $pct = (float) ($s['increase_percent'] ?? 0);
        $total = $pct > 0 ? $retail + ($retail * $pct / 100) : $retail;

        return $total / max(1, $months);
    }

    protected function wholesalePrice(float $fxPrice): float
    {
        $s = $this->section('wholesale');
        if (! ($s['enabled'] ?? true)) {
            return $fxPrice;
        }
        $pct = (float) ($s['discount_percent'] ?? 0);
        $retail = $this->retailPrice($fxPrice);

        return $pct > 0 ? $retail - ($retail * $pct / 100) : $retail;
    }

    protected function applySectionRounding(float $price, string $section): float
    {
        $s = $this->section($section);
        if (! ($s['round_enabled'] ?? true)) {
            return $price;
        }
        $roundTo = max(1, (int) ($s['round_to'] ?? 1000));

        return (float) (round($price / $roundTo) * $roundTo);
    }

    /** @return array<string, mixed> */
    protected function section(string $key): array
    {
        $all = $this->settings ?? self::defaultSettings();

        return is_array($all[$key] ?? null) ? $all[$key] : [];
    }
}
