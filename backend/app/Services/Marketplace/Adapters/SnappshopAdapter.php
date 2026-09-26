<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\MarketplaceProductMap;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceHttp;

/**
 * SnappShop seller API (apix inventory + automation), port of WNC_Snappshop_Adapter.
 */
class SnappshopAdapter extends BaseAdapter
{
    public function platform(): string
    {
        return 'snappshop';
    }

    protected function vendorId(array $c): string
    {
        $vendor = (string) (($c['vendor_id'] ?? '') ?: ($c['shop_code'] ?? ''));
        if ($vendor === '') {
            $this->fail(__('marketplace.snappshop_vendor_missing'));
        }

        return $vendor;
    }

    protected function panelToken(array $c): string
    {
        return (string) (($c['token'] ?? '') ?: ($c['token_api'] ?? ''));
    }

    protected function automationToken(array $c): string
    {
        return (string) (($c['token_api'] ?? '') ?: ($c['token'] ?? ''));
    }

    /** @return array<string, string> */
    protected function uaHeaders(array $c): array
    {
        $ua = (string) ($c['user_agent'] ?? '');

        return ['User-Agent' => $ua !== '' ? $ua : 'WebinoDashboard/1.0'];
    }

    /**
     * @param  array<string, string>  $extra
     * @return array<string, mixed>
     */
    protected function request(string $method, string $base, string $path, string $token, mixed $body = null, ?array $query = null, array $extra = []): array
    {
        if ($token === '') {
            $this->fail(__('marketplace.snappshop_token_missing'));
        }
        try {
            return MarketplaceHttp::request($method, MarketplaceHttp::join($base, $path), [
                'headers' => array_merge([
                    'Authorization' => 'Bearer '.$token,
                    'x-client-type' => 'seller',
                    'referer' => 'https://seller.snappshop.ir/',
                    'origin' => 'https://seller.snappshop.ir',
                ], $extra),
                'body' => $body,
                'query' => $query,
            ]);
        } catch (MarketplaceException $e) {
            $this->logError('api', 'SnappShop API error: '.$e->getMessage(), ['path' => $path]);
            throw $e;
        }
    }

    protected function inventory(int $page): array
    {
        $c = $this->credentials();
        $vendor = $this->vendorId($c);

        return $this->request('GET', $c['base_url'], 'vendors/v1/'.rawurlencode($vendor).'/inventory/products', $this->panelToken($c), null, ['page' => $page], ['snappshop-seller-code' => $vendor]);
    }

    public function testConnection(): array
    {
        $this->inventory(1);

        return ['ok' => true, 'message' => __('marketplace.connection_ok')];
    }

    public function searchProducts(string $keyword = '', int $page = 1): array
    {
        $c = $this->credentials();
        $vendor = $this->vendorId($c);
        try {
            $res = $this->inventory($page);
        } catch (MarketplaceException) {
            $res = $this->request('GET', $c['automation_base_url'], 'vendors/'.rawurlencode($vendor).'/products', $this->automationToken($c), null, ['page' => $page], $this->uaHeaders($c));
        }

        $kw = mb_strtolower(trim($keyword));
        $out = [];
        foreach ($this->listFrom($res, ['data.data', 'data', 'products']) as $item) {
            $title = (string) ($item['title'] ?? $item['name'] ?? '');
            $id = (string) ($item['id'] ?? $item['product_id'] ?? '');
            if ($kw !== '' && ! str_contains(mb_strtolower($title.' '.$id.' '.($item['sku'] ?? '')), $kw)) {
                continue;
            }
            $out[] = [
                'id' => $id,
                'variant_id' => (string) ($item['sku'] ?? $id),
                'title' => $title !== '' ? $title : 'Product #'.$id,
                'price' => (int) ($item['price'] ?? 0),
                'stock' => (int) ($item['stock'] ?? $item['warehouse_stock'] ?? 0),
                'sku' => (string) ($item['sku'] ?? ''),
                'image' => (string) ($item['image'] ?? $item['thumbnail'] ?? ''),
            ];
        }

        return $out;
    }

    public function pushPrice(MarketplaceProductMap $map, int $price): void
    {
        $this->pushPriceStock($map, $price, (int) ($map->remote_stock ?? 0));
    }

    public function pushStock(MarketplaceProductMap $map, int $stock): void
    {
        $this->pushPriceStock($map, (int) ($map->remote_price ?? 0), $stock);
    }

    public function pushPriceStock(MarketplaceProductMap $map, int $price, int $stock): void
    {
        $c = $this->credentials();
        $vendor = $this->vendorId($c);
        $id = $this->remoteId($map);
        if ($id === '') {
            $this->fail(__('marketplace.invalid_remote_id'));
        }
        $row = ['id' => $id, 'sku' => (string) ($map->remote_variant_id ?: $id), 'stock' => max(0, $stock)];
        if ($price > 0) {
            $row['price'] = $price;
        }
        try {
            $this->request('PATCH', $c['automation_base_url'], 'vendors/'.rawurlencode($vendor).'/products', $this->automationToken($c), ['products' => [$row]], null, $this->uaHeaders($c));
        } catch (MarketplaceException $e) {
            if ($price <= 0) {
                throw $e;
            }
            $this->request('PUT', $c['base_url'], 'vendors/v1/'.rawurlencode($vendor).'/inventory/products/'.rawurlencode($id), $this->panelToken($c), ['price' => $price, 'stock' => max(0, $stock)], null, ['snappshop-seller-code' => $vendor]);
        }
    }

    public function pullOrders(array $args = []): array
    {
        $c = $this->credentials();
        $vendor = $this->vendorId($c);
        $res = $this->request('GET', $c['base_url'], 'vendors/v1/'.rawurlencode($vendor).'/orders/report', $this->panelToken($c), null, [
            'start_date' => $args['start_date'] ?? now()->subDays(14)->format('Y-m-d'),
            'end_date' => $args['end_date'] ?? now()->format('Y-m-d'),
            'page' => (int) ($args['page'] ?? 1),
        ], ['snappshop-seller-code' => $vendor]);

        return array_map(
            fn ($o) => array_merge($o, ['id' => (string) ($o['id'] ?? $o['order_id'] ?? $o['code'] ?? '')]),
            $this->listFrom($res, ['data.data', 'data', 'orders'])
        );
    }

    public function getOrder(string $remoteId): ?array
    {
        foreach ($this->pullOrders() as $order) {
            if ((string) $order['id'] === $remoteId) {
                return $order;
            }
        }

        return null;
    }
}
