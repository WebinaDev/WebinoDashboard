<?php

namespace App\Observers;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\Basalam\BasalamDiscounts;
use App\Services\Marketplace\Basalam\BasalamProducts;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;
use App\Services\Marketplace\TorobWebhookQueue;
use Throwable;

/**
 * Queues marketplace pushes (and Torob page webhooks) when price/stock-relevant fields change.
 */
class MarketplaceProductObserver
{
    public const WATCHED = [
        'price_minor', 'sale_price_minor', 'purchase_price_minor', 'stock', 'stock_status',
        'manage_stock', 'platform_prices', 'lock_price',
    ];

    /** Content fields that Basalam full updates carry (name, photos, description, attributes, weight). */
    public const BASALAM_CONTENT = [
        'name', 'status', 'description', 'short_description', 'image_url', 'cover_image_url', 'gallery',
        'video_url', 'weight', 'meta', 'attribute_values', 'sku',
    ];

    public const PRICE_FIELDS = ['price_minor', 'sale_price_minor'];

    public function saved(Product|ProductVariant $model): void
    {
        if (! $model->wasRecentlyCreated && ! $model->wasChanged(self::WATCHED) && ! $model->wasChanged(['name', 'status', 'slug', 'image_url']) && ! $model->wasChanged(self::BASALAM_CONTENT)) {
            return;
        }
        try {
            $product = $model instanceof ProductVariant ? $model->product : $model;
            if (! $product) {
                return;
            }
            if ($model->wasChanged(self::WATCHED)) {
                app(MarketplaceSync::class)->productChanged($product, $model instanceof ProductVariant ? $model : null);
            }
            $this->basalam($model, $product);
            app(TorobWebhookQueue::class)->touch($product);
        } catch (Throwable $e) {
            report($e);
        }
    }

    protected function basalam(Product|ProductVariant $model, Product $product): void
    {
        if ($model->wasRecentlyCreated || ! app(MarketplaceSettingsService::class)->isEnabled((int) $product->tenant_id, 'basalam')) {
            return;
        }
        if ($model->wasChanged(self::BASALAM_CONTENT)) {
            BasalamProducts::for((int) $product->tenant_id)->productChanged($product);
        }
        if ($model->wasChanged(self::PRICE_FIELDS)) {
            BasalamDiscounts::for((int) $product->tenant_id)->handleProduct($product);
        }
    }
}
