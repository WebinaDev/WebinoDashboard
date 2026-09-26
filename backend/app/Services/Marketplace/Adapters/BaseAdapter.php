<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\MarketplaceProductMap;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\MarketplaceAdapter;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplacePlatforms;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\OrderNormalizer;

abstract class BaseAdapter implements MarketplaceAdapter
{
    public function __construct(
        protected int $tenantId,
        protected MarketplaceSettingsService $settings,
    ) {}

    public function kind(): string
    {
        return MarketplacePlatforms::CATALOG[$this->platform()]['kind'];
    }

    /** @return array<string, mixed> */
    protected function credentials(): array
    {
        return $this->settings->credentials($this->tenantId, $this->platform());
    }

    /** @return array<string, mixed> */
    public function credentialsPublic(): array
    {
        return $this->credentials();
    }

    /** @return array<string, mixed> */
    protected function state(): array
    {
        return $this->settings->state($this->tenantId, $this->platform());
    }

    /** @param  array<string, mixed>  $patch */
    protected function putState(array $patch): void
    {
        $this->settings->putState($this->tenantId, $this->platform(), $patch);
    }

    /** @param  array<string, mixed>  $meta */
    protected function logError(string $channel, string $message, array $meta = []): void
    {
        MarketplaceLogger::error($this->tenantId, $this->platform(), $channel, $message, $meta);
    }

    /** @param  array<string, mixed>  $meta */
    protected function logInfo(string $channel, string $message, array $meta = []): void
    {
        MarketplaceLogger::info($this->tenantId, $this->platform(), $channel, $message, $meta);
    }

    protected function fail(string $message, int $status = 422): never
    {
        throw new MarketplaceException($message, $status);
    }

    public function searchProducts(string $keyword = '', int $page = 1): array
    {
        return [];
    }

    public function pushPrice(MarketplaceProductMap $map, int $price): void
    {
        $this->fail(__('marketplace.push_unsupported'));
    }

    public function pushStock(MarketplaceProductMap $map, int $stock): void
    {
        $this->fail(__('marketplace.push_unsupported'));
    }

    public function pushPriceStock(MarketplaceProductMap $map, int $price, int $stock): void
    {
        $this->pushPrice($map, $price);
        $this->pushStock($map, $stock);
    }

    public function pullOrders(array $args = []): array
    {
        return [];
    }

    public function getOrder(string $remoteId): ?array
    {
        return null;
    }

    public function normalizeOrder(array $raw): array
    {
        return OrderNormalizer::normalize($this->platform(), $raw);
    }

    public function mapOrderStatus(string $remoteStatus): string
    {
        return OrderNormalizer::genericStatus($remoteStatus);
    }

    public function supportsCreate(): bool
    {
        return false;
    }

    public function createProduct(Product $product, ?ProductVariant $variant = null): array
    {
        $this->fail(__('marketplace.create_unsupported'));
    }

    /** Remote id used for single-id platforms (product id, falling back to variant id). */
    protected function remoteId(MarketplaceProductMap $map): string
    {
        return (string) ($map->remote_product_id ?: $map->remote_variant_id);
    }

    /** Remote variant id (variant id, falling back to product id). */
    protected function remoteVariantId(MarketplaceProductMap $map): string
    {
        return (string) ($map->remote_variant_id ?: $map->remote_product_id);
    }

    /**
     * Extract a list payload from common envelope shapes.
     *
     * @param  array<string, mixed>  $res
     * @param  list<string>  $paths
     * @return list<array<string, mixed>>
     */
    protected function listFrom(array $res, array $paths): array
    {
        foreach ($paths as $path) {
            $v = data_get($res, $path);
            if (is_array($v) && array_is_list($v)) {
                return array_values(array_filter($v, 'is_array'));
            }
        }

        return [];
    }
}
