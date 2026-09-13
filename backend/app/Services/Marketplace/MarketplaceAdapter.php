<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceProductMap;
use App\Models\Product;

interface MarketplaceAdapter
{
    public function canCreate(): bool;

    public function canFindVariants(): bool;

    /** @return array{error?: string, remote_price?: int, remote_stock?: int} */
    public function syncPriceStock(Product $product, MarketplaceProductMap $map): array;

    /** @return array{error?: string, remote_product_id?: string, remote_variant_id?: string, remote_url?: string} */
    public function createRemote(Product $product): array;

    /** @return array{error?: string, remote_product_id?: string, remote_variant_id?: string, remote_url?: string, variants?: list<array>} */
    public function resolveProduct(string $remoteId, ?string $variantId = null): array;
}
