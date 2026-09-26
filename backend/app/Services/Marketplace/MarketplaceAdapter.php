<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceProductMap;
use App\Models\Product;
use App\Models\ProductVariant;

/**
 * Marketplace platform adapter contract (port of WNC_Platform).
 * Failing calls throw {@see MarketplaceException}.
 */
interface MarketplaceAdapter
{
    public function platform(): string;

    /** `api` (seller API we push to) or `feed` (crawler pulls from us). */
    public function kind(): string;

    /** @return array{ok: bool, message: string, details?: array<string, mixed>} */
    public function testConnection(): array;

    /** @return list<array{id: string, variant_id: string, title: string, price: int, stock: int, sku?: string, url?: string, image?: string}> */
    public function searchProducts(string $keyword = '', int $page = 1): array;

    public function pushPrice(MarketplaceProductMap $map, int $price): void;

    public function pushStock(MarketplaceProductMap $map, int $stock): void;

    public function pushPriceStock(MarketplaceProductMap $map, int $price, int $stock): void;

    /**
     * @param  array<string, mixed>  $args
     * @return list<array<string, mixed>> Raw remote orders, each with an `id`
     */
    public function pullOrders(array $args = []): array;

    /** @return array<string, mixed>|null */
    public function getOrder(string $remoteId): ?array;

    /**
     * @param  array<string, mixed>  $raw
     * @return array{id: string, status: string, items: list<array<string, mixed>>, customer: array<string, string>, raw: array<string, mixed>}
     */
    public function normalizeOrder(array $raw): array;

    /** Map a normalized remote status onto a Dashboard Order status. */
    public function mapOrderStatus(string $remoteStatus): string;

    public function supportsCreate(): bool;

    /** @return array{remote_product_id?: string, remote_variant_id?: string, remote_url?: string} */
    public function createProduct(Product $product, ?ProductVariant $variant = null): array;
}
