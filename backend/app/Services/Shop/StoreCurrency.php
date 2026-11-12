<?php

namespace App\Services\Shop;

use App\Models\Tenant;
use App\Support\Currency;

/**
 * Store display currency (default IRT / toman) and row-stamp resolution.
 *
 * Each amount is interpreted in its own row currency. A missing stamp falls
 * back to the shop/tenant display currency. Convert to store units for
 * display and cart totals; convert once more to the gateway API unit.
 */
final class StoreCurrency
{
    public static function code(?int $tenantId, ?Tenant $tenant = null): string
    {
        if ($tenantId) {
            $raw = trim((string) (ShopSettings::getGeneral($tenantId)['currency'] ?? ''));
            if ($raw !== '') {
                $code = Currency::normalize($raw, 'IRT');
                if (in_array($code, Currency::DISPLAY_CODES, true)) {
                    return $code;
                }
            }
        }

        $row = $tenant ?? ($tenantId ? Tenant::query()->find($tenantId) : null);
        $code = Currency::normalize((string) ($row?->default_currency ?? 'IRT'), 'IRT');

        return in_array($code, Currency::DISPLAY_CODES, true) ? $code : 'IRT';
    }

    /** Currency of a stamped row, or the store currency when the stamp is empty/unknown. */
    public static function resolve(?string $rowCurrency, ?int $tenantId, ?Tenant $tenant = null): string
    {
        $raw = trim((string) $rowCurrency);
        if ($raw !== '') {
            $code = Currency::normalize($raw, 'IRT');
            if (in_array($code, Currency::DISPLAY_CODES, true)) {
                return $code;
            }
        }

        return self::code($tenantId, $tenant);
    }

    public static function toStore(int|float $amount, ?string $rowCurrency, ?int $tenantId, ?Tenant $tenant = null): int
    {
        return Currency::convert($amount, self::resolve($rowCurrency, $tenantId, $tenant), self::code($tenantId, $tenant));
    }

    public static function toRial(int|float $amount, ?string $rowCurrency, ?int $tenantId, ?Tenant $tenant = null): int
    {
        return Currency::toGatewayRial($amount, self::resolve($rowCurrency, $tenantId, $tenant));
    }
}
