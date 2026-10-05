<?php

namespace App\Observers;

use App\Models\Product;
use App\Models\ProductPriceHistory;
use App\Services\Shop\StockAlertNotifier;

class ProductPriceHistoryObserver
{
    public function __construct(protected StockAlertNotifier $alerts) {}
    /** @var list<string> */
    public const FIELDS = ['price_minor', 'sale_price_minor'];

    public function updated(Product $product): void
    {
        if (! $product->wasChanged(self::FIELDS)) {
            return;
        }
        ProductPriceHistory::query()->create([
            'tenant_id' => $product->tenant_id,
            'product_id' => $product->id,
            'price_minor' => (int) $product->price_minor,
            'sale_price_minor' => $product->sale_price_minor ? (int) $product->sale_price_minor : null,
            'recorded_at' => now(),
        ]);
        $product->forceFill(['price_updated_at' => now()])->saveQuietly();
        if ($product->isOnSale()) {
            try {
                $this->alerts->notifyOnSale($product);
            } catch (\Throwable) {
            }
        }
    }

    public function created(Product $product): void
    {
        ProductPriceHistory::query()->create([
            'tenant_id' => $product->tenant_id,
            'product_id' => $product->id,
            'price_minor' => (int) $product->price_minor,
            'sale_price_minor' => $product->sale_price_minor ? (int) $product->sale_price_minor : null,
            'recorded_at' => now(),
        ]);
    }
}
