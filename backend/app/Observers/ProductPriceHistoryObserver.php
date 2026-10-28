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
        $previous = $this->previousEffectivePrice($product);
        $product->forceFill(['price_updated_at' => now()])->saveQuietly();
        try {
            $this->alerts->notifyPriceDrop($product, $previous);
        } catch (\Throwable) {
        }
        if ($product->isOnSale()) {
            try {
                $this->alerts->notifyOnSale($product);
            } catch (\Throwable) {
            }
        }
    }

    protected function previousEffectivePrice(Product $product): int
    {
        $before = (clone $product)->forceFill([
            'price_minor' => $product->getOriginal('price_minor'),
            'sale_price_minor' => $product->getOriginal('sale_price_minor'),
        ]);

        return (int) $before->effectivePriceMinor();
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
