<?php

namespace App\Services\Shipping;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;

final class ShipmentWeight
{
    public static function unitGrams(?Product $product, ?ProductVariant $variant = null): int
    {
        $weight = $variant?->weight ?? $product?->weight;
        if ($weight === null || (float) $weight <= 0) {
            return 0;
        }
        $value = (float) $weight;

        return (int) round($value >= 50 ? $value : $value * 1000);
    }

    public static function cartGrams(iterable $lines): int
    {
        $total = 0;
        foreach ($lines as $line) {
            $product = $line->product ?? null;
            $qty = max(1, (int) ($line->quantity ?? 1));
            $total += self::unitGrams($product instanceof Product ? $product : null) * $qty;
        }

        return $total;
    }

    public static function orderGrams(Order $order): int
    {
        $order->loadMissing('items.product', 'items.variant');
        $total = 0;
        foreach ($order->items as $item) {
            $variant = $item->relationLoaded('variant') ? $item->variant : null;
            $product = $item->relationLoaded('product') ? $item->product : null;
            $grams = self::unitGrams($product, $variant instanceof ProductVariant ? $variant : null);
            $total += $grams * max(1, (int) $item->quantity);
        }

        return $total;
    }
}
