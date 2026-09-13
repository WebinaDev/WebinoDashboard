<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceProductMap;
use App\Models\Product;

class NullMarketplaceAdapter implements MarketplaceAdapter
{
    public function __construct(protected string $platform) {}

    public function canCreate(): bool
    {
        return true;
    }

    public function canFindVariants(): bool
    {
        return $this->platform === 'digikala';
    }

    public function syncPriceStock(Product $product, MarketplaceProductMap $map): array
    {
        return [
            'remote_price' => $product->price_minor,
            'remote_stock' => $product->stock,
        ];
    }

    public function createRemote(Product $product): array
    {
        $id = 'local-'.$product->id;

        return [
            'remote_product_id' => $id,
            'remote_url' => null,
        ];
    }

    public function resolveProduct(string $remoteId, ?string $variantId = null): array
    {
        $url = $this->platform === 'digikala'
            ? 'https://www.digikala.com/product/dkp-'.$remoteId
            : null;

        return [
            'remote_product_id' => $remoteId,
            'remote_variant_id' => $variantId,
            'remote_url' => $url,
            'variants' => $variantId ? [['id' => $variantId, 'label' => $variantId]] : [],
        ];
    }
}
