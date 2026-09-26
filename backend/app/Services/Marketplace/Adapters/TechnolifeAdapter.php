<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\MarketplaceProductMap;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceHttp;

/**
 * Technolife seller API with configurable paths, port of WNC_Technolife_Adapter.
 */
class TechnolifeAdapter extends BaseAdapter
{
    public function platform(): string
    {
        return 'technolife';
    }

    /** @param  array<string, string>  $vars */
    protected function path(string $template, array $vars = []): string
    {
        foreach ($vars as $k => $v) {
            $template = str_replace('{'.$k.'}', rawurlencode($v), $template);
        }

        return ltrim($template, '/');
    }

    /** @return array<string, mixed> */
    protected function request(string $method, string $path, mixed $body = null, ?array $query = null): array
    {
        $c = $this->credentials();
        if (empty($c['base_url'])) {
            $this->fail(__('marketplace.technolife_base_missing'));
        }
        if (empty($c['api_key'])) {
            $this->fail(__('marketplace.technolife_key_missing'));
        }
        $headers = ($c['auth_header'] ?? 'bearer') === 'x-api-key'
            ? ['X-Api-Key' => (string) $c['api_key']]
            : ['Authorization' => 'Bearer '.$c['api_key']];
        try {
            return MarketplaceHttp::request($method, MarketplaceHttp::join($c['base_url'], $path), ['headers' => $headers, 'body' => $body, 'query' => $query]);
        } catch (MarketplaceException $e) {
            $this->logError('api', 'Technolife API error: '.$e->getMessage(), ['path' => $path]);
            throw $e;
        }
    }

    public function testConnection(): array
    {
        $c = $this->credentials();
        try {
            $this->request('GET', $this->path((string) $c['test_path']));
        } catch (MarketplaceException) {
            $this->request('GET', $this->path((string) $c['products_path']), null, ['page' => 1, 'per_page' => 1]);
        }

        return ['ok' => true, 'message' => __('marketplace.connection_ok')];
    }

    public function searchProducts(string $keyword = '', int $page = 1): array
    {
        $c = $this->credentials();
        $query = ['page' => $page, 'per_page' => 20];
        if ($keyword !== '') {
            $query['q'] = $keyword;
            $query['search'] = $keyword;
        }
        $res = $this->request('GET', $this->path((string) $c['products_path']), null, $query);
        $out = [];
        foreach ($this->listFrom($res, ['data.data', 'data', 'products', 'items']) as $item) {
            $variants = is_array($item['variants'] ?? null) ? $item['variants'] : [$item];
            foreach ($variants as $v) {
                if (! is_array($v)) {
                    continue;
                }
                $out[] = [
                    'id' => (string) ($item['id'] ?? $item['product_id'] ?? ''),
                    'variant_id' => (string) ($v['id'] ?? $v['variant_id'] ?? $item['id'] ?? ''),
                    'title' => (string) ($item['title'] ?? $item['name'] ?? $v['title'] ?? ''),
                    'price' => (int) ($v['price'] ?? $item['price'] ?? 0),
                    'stock' => (int) ($v['stock'] ?? $item['stock'] ?? 0),
                ];
            }
        }

        return $out;
    }

    protected function variantPath(MarketplaceProductMap $map, string $key): string
    {
        $variant = $this->remoteVariantId($map);
        if ($variant === '') {
            $this->fail(__('marketplace.invalid_remote_id'));
        }

        return $this->path((string) $this->credentials()[$key], [
            'variant_id' => $variant,
            'product_id' => (string) $map->remote_product_id,
        ]);
    }

    public function pushPrice(MarketplaceProductMap $map, int $price): void
    {
        $path = $this->variantPath($map, 'price_path');
        try {
            $this->request('PATCH', $path, ['price' => $price, 'selling_price' => $price]);
        } catch (MarketplaceException) {
            $this->request('PUT', $path, ['price' => $price]);
        }
    }

    public function pushStock(MarketplaceProductMap $map, int $stock): void
    {
        $path = $this->variantPath($map, 'stock_path');
        $qty = max(0, $stock);
        try {
            $this->request('PATCH', $path, ['stock' => $qty, 'quantity' => $qty]);
        } catch (MarketplaceException) {
            $this->request('PUT', $path, ['stock' => $qty]);
        }
    }

    public function pullOrders(array $args = []): array
    {
        $c = $this->credentials();
        $res = $this->request('GET', $this->path((string) $c['orders_path']), null, [
            'page' => (int) ($args['page'] ?? 1),
            'per_page' => (int) ($args['per_page'] ?? 20),
        ]);

        return array_map(
            fn ($o) => array_merge($o, ['id' => (string) ($o['id'] ?? $o['order_id'] ?? '')]),
            $this->listFrom($res, ['data.data', 'data', 'orders', 'items'])
        );
    }

    public function getOrder(string $remoteId): ?array
    {
        $c = $this->credentials();
        try {
            $res = $this->request('GET', $this->path((string) $c['order_path'], ['order_id' => $remoteId]));
        } catch (MarketplaceException) {
            return null;
        }
        $data = is_array($res['data'] ?? null) ? $res['data'] : $res;
        $data['id'] = $remoteId;

        return $data;
    }
}
