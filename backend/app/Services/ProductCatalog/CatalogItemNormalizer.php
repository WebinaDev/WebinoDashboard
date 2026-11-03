<?php

namespace App\Services\ProductCatalog;

use App\Models\Tenant;

/**
 * Shared helpers for mapping remote catalog rows into a stable import payload.
 */
final class CatalogItemNormalizer
{
    /**
     * Convert a remote amount (rial or toman) into the tenant store currency minor units.
     */
    public static function toStoreMinor(float $amount, string $unit, string $storeCurrency): int
    {
        if ($amount <= 0) {
            return 0;
        }
        $rial = strtolower($unit) === 'rial' ? $amount : $amount * 10;
        $cur = strtoupper($storeCurrency);

        return (int) round(in_array($cur, ['IRR', 'IR'], true) ? $rial : $rial / 10);
    }

    public static function storeCurrency(int $tenantId): string
    {
        return strtoupper((string) (Tenant::query()->whereKey($tenantId)->value('default_currency') ?: 'IRT'));
    }

    /**
     * @param  array<string, mixed>  $fields
     * @return array<string, mixed>
     */
    public static function item(array $fields): array
    {
        return [
            'id' => (string) ($fields['id'] ?? ''),
            'source' => (string) ($fields['source'] ?? ''),
            'title' => (string) ($fields['title'] ?? ''),
            'brand' => (string) ($fields['brand'] ?? ''),
            'description' => (string) ($fields['description'] ?? ''),
            'sku' => (string) ($fields['sku'] ?? ''),
            'image_url' => (string) ($fields['image_url'] ?? ''),
            'url' => (string) ($fields['url'] ?? ''),
            'price_minor' => (int) ($fields['price_minor'] ?? 0),
            'currency' => (string) ($fields['currency'] ?? 'IRT'),
            'raw_price' => isset($fields['raw_price']) ? (float) $fields['raw_price'] : null,
            'price_unit' => (string) ($fields['price_unit'] ?? ''),
        ];
    }
}
