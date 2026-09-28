<?php

namespace App\Services\Orders;

use App\Services\Modules\ModuleSettingsService;
use App\Services\Shop\ShopSettings;

/**
 * Checkout tax (single store-wide rate from shop.accounting.tax).
 *
 * Tax is only charged once the tenant has saved tax settings: the stored defaults
 * (enabled, 9%) must not silently change totals for stores that never configured tax.
 */
final class OrderTax
{
    /**
     * @return array{tax_minor: int, added_minor: int, lines: list<array{name: string, code: string, rate: float, order_tax: int, shipping_tax: int}>}
     */
    public static function compute(int $tenantId, int $itemsMinor, int $shippingMinor): array
    {
        $none = ['tax_minor' => 0, 'added_minor' => 0, 'lines' => []];

        $stored = app(ModuleSettingsService::class)->get($tenantId, ShopSettings::MODULE, ShopSettings::TAX_KEY);
        if (! is_array($stored) || $stored === []) {
            return $none;
        }
        $tax = ShopSettings::getTax($tenantId);
        $calcTaxes = filter_var(ShopSettings::getGeneral($tenantId)['calc_taxes'] ?? true, FILTER_VALIDATE_BOOLEAN);
        $rate = (float) ($tax['rate_percent'] ?? 0);
        if (! $calcTaxes || ! filter_var($tax['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN) || $rate <= 0) {
            return $none;
        }

        $inclusive = filter_var($tax['prices_include_tax'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $shippingTaxable = filter_var($tax['shipping_taxable'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $portion = fn (int $base): int => $base <= 0 ? 0 : (int) round($inclusive
            ? $base * $rate / (100 + $rate)
            : $base * $rate / 100);

        $orderTax = $portion(max(0, $itemsMinor));
        $shippingTax = $shippingTaxable ? $portion(max(0, $shippingMinor)) : 0;
        $total = $orderTax + $shippingTax;
        if ($total <= 0) {
            return $none;
        }

        return [
            'tax_minor' => $total,
            'added_minor' => $inclusive ? 0 : $total,
            'lines' => [[
                'name' => (string) ($tax['label'] ?? 'VAT'),
                'code' => (string) ($tax['code'] ?? 'VAT'),
                'rate' => $rate,
                'order_tax' => $orderTax,
                'shipping_tax' => $shippingTax,
            ]],
        ];
    }
}
