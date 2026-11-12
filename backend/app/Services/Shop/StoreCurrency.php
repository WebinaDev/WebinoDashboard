<?php

namespace App\Services\Shop;

use App\Models\Tenant;
use App\Support\Currency;

/**
 * Single source of truth for the store display currency (default IRT / toman).
 *
 * Prefers shop general settings, then the tenant column. Product/order
 * currency stamps are not trusted — they have historically been saved as IRR
 * while amounts were entered in toman.
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
}
