<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\MarketplaceProductMap;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceHttp;
use App\Services\Marketplace\MarketplacePricing;

/**
 * TapsiShop vendor hub API with automatic token refresh, port of WNC_Tapsishop_Adapter.
 */
class TapsishopAdapter extends BaseAdapter
{
    public function platform(): string
    {
        return 'tapsishop';
    }

    /** @return array<string, mixed> */
    protected function creds(): array
    {
        $c = $this->credentials();
        $state = $this->state();
        if (! empty($state['token'])) {
            $c['token'] = $state['token'];
            $c['token_expires_at'] = (int) ($state['expires_at'] ?? 0);
        }

        return $c;
    }

    /** @return array<string, string> */
    protected function headers(array $c, bool $auth = true): array
    {
        $h = [
            'accept' => 'application/json',
            'client-name' => (string) $c['client_name'],
            'client-version' => (string) $c['client_version'],
        ];
        if ($auth && ! empty($c['token'])) {
            $h['TapsiShop.Hub.Authorization'] = (string) $c['token'];
        }

        return $h;
    }

    public function refreshToken(): string
    {
        $c = $this->creds();
        if (empty($c['token'])) {
            $this->fail(__('marketplace.tapsishop_token_missing'));
        }
        $res = MarketplaceHttp::request('POST', MarketplaceHttp::join($c['base_url'], 'Web/Hub/vendors/v1/refresh-token'), [
            'headers' => $this->headers($c, false),
            'body' => [
                'token' => $c['token'],
                'name' => (string) $c['token_name'],
                'revokeCurrentToken' => false,
                'expiredAt' => now()->addDays(30)->toIso8601String(),
            ],
        ]);
        $new = (string) (data_get($res, 'data.token') ?? $res['token'] ?? '');
        if ($new === '') {
            $this->fail(__('marketplace.tapsishop_refresh_failed'));
        }
        $expRaw = data_get($res, 'data.expireDate') ?? data_get($res, 'data.expiredAt');
        $expires = $expRaw ? (int) strtotime((string) $expRaw) : now()->addDays(30)->timestamp;
        $this->putState(['token' => $new, 'expires_at' => $expires]);
        $this->settings->patchCredentials($this->tenantId, 'tapsishop', ['token' => $new]);
        $this->logInfo('auth', 'TapsiShop token refreshed');

        return $new;
    }

    protected function accessToken(): string
    {
        $c = $this->creds();
        if (empty($c['token'])) {
            $this->fail(__('marketplace.tapsishop_token_missing'));
        }
        $exp = (int) ($c['token_expires_at'] ?? 0);
        if ($exp > 0 && $exp <= time() + 86400) {
            try {
                return $this->refreshToken();
            } catch (MarketplaceException) {
            }
        }

        return (string) $c['token'];
    }

    /** @return array<string, mixed> */
    protected function request(string $method, string $path, mixed $body = null, ?array $query = null): array
    {
        $c = $this->creds();
        $c['token'] = $this->accessToken();
        $url = MarketplaceHttp::join($c['base_url'], $path);
        try {
            return MarketplaceHttp::request($method, $url, ['headers' => $this->headers($c), 'body' => $body, 'query' => $query]);
        } catch (MarketplaceException $e) {
            if ($e->status === 401) {
                try {
                    $c['token'] = $this->refreshToken();

                    return MarketplaceHttp::request($method, $url, ['headers' => $this->headers($c), 'body' => $body, 'query' => $query]);
                } catch (MarketplaceException $e2) {
                    $e = $e2;
                }
            }
            $this->logError('api', 'TapsiShop API error: '.$e->getMessage(), ['path' => $path]);
            throw $e;
        }
    }

    /** TapsiShop always expects rial rounded to 10. */
    protected function toRial(int $price): int
    {
        if ($price <= 0) {
            return 0;
        }
        if (MarketplacePricing::forTenant($this->tenantId)->unit('tapsishop') !== 'rial') {
            $price *= 10;
        }

        return (int) (round($price / 10) * 10);
    }

    public function testConnection(): array
    {
        $res = $this->request('GET', 'Web/Hub/vendors/v1/vendor-information');

        return ['ok' => true, 'message' => __('marketplace.connection_ok'), 'details' => ['vendor' => data_get($res, 'data.title') ?? data_get($res, 'data.name')]];
    }

    public function searchProducts(string $keyword = '', int $page = 1): array
    {
        $res = $this->request('GET', 'Web/Hub/vendors/v1/products/'.max(1, $page).'/50');
        $kw = mb_strtolower(trim($keyword));
        $out = [];
        foreach ($this->listFrom($res, ['data.items', 'data', 'items']) as $item) {
            $id = (string) ($item['id'] ?? $item['sku'] ?? '');
            $title = (string) ($item['title'] ?? $item['name'] ?? $item['sku'] ?? '');
            if ($kw !== '' && ! str_contains(mb_strtolower($title.' '.$id.' '.($item['hsin'] ?? '')), $kw)) {
                continue;
            }
            $out[] = [
                'id' => $id,
                'variant_id' => (string) ($item['sku'] ?? $id),
                'title' => $title !== '' ? $title : 'Item #'.$id,
                'price' => (int) ($item['finalPrice'] ?? $item['originalPrice'] ?? 0),
                'stock' => (int) ($item['onHandQuantity'] ?? $item['onHandQty'] ?? 0),
                'sku' => (string) ($item['sku'] ?? ''),
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
        $id = $this->remoteId($map);
        if ($id === '') {
            $this->fail(__('marketplace.invalid_remote_id'));
        }
        $rial = $this->toRial($price);
        $this->request('PUT', 'web/hub/vendors/v1/products', [
            'products' => [[
                'id' => $id,
                'stock' => max(0, $stock),
                'price' => $rial,
                'specialprice' => $rial,
            ]],
        ]);
    }

    public function pullOrders(array $args = []): array
    {
        $page = max(1, (int) ($args['page'] ?? 1));
        try {
            $res = $this->request('GET', 'Web/Hub/vendors/v1/orders/'.$page.'/50');
        } catch (MarketplaceException) {
            $res = $this->request('GET', 'Web/Hub/vendors/v1/orders', null, ['page' => $page]);
        }

        return array_map(
            fn ($o) => array_merge($o, ['id' => (string) ($o['id'] ?? $o['orderId'] ?? $o['code'] ?? '')]),
            $this->listFrom($res, ['data.items', 'data', 'orders'])
        );
    }

    public function getOrder(string $remoteId): ?array
    {
        try {
            $res = $this->request('GET', 'Web/Hub/vendors/v1/orders/'.rawurlencode($remoteId));
        } catch (MarketplaceException) {
            return null;
        }
        $data = is_array($res['data'] ?? null) ? $res['data'] : $res;
        $data['id'] = $remoteId;

        return $data;
    }
}
