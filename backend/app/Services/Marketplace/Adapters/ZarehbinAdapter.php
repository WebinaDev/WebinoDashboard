<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\MarketplaceException;

/**
 * Zarehbin crawler feed (zarehbin/v1/products), port of WNC_Zarehbin_Adapter/Feed.
 */
class ZarehbinAdapter extends FeedAdapter
{
    public const AUTH_URL = 'https://www.zarehbin.com/bots/api/auth';

    public function platform(): string
    {
        return 'zarehbin';
    }

    public function authUrl(): string
    {
        return self::AUTH_URL;
    }

    protected function probeAsForm(): bool
    {
        return false;
    }

    protected function probeBody(): array
    {
        return ['token' => 'webino-connectivity-probe', 'domain' => $this->catalog()->siteDomain(), 'version' => (string) ($this->credentials()['version'] ?? '1.0.0')];
    }

    /** @return true|string true or an error message */
    public function verifyToken(string $token): bool|string
    {
        $token = trim($token);
        if ($token === '') {
            return __('marketplace.zarehbin_token_empty');
        }
        $key = 'zarehbin_ok_'.md5($token);
        if (cache()->get($key.':'.$this->tenantId)) {
            return true;
        }
        try {
            $res = $this->postAuth([
                'token' => $token,
                'domain' => $this->catalog()->siteDomain(),
                'version' => (string) ($this->credentials()['version'] ?? '1.0.0'),
            ], false, 12);
        } catch (MarketplaceException $e) {
            if ($e->status === 0) {
                return __('marketplace.feed_auth_unreachable');
            }
            $res = $e->response;
        }
        if ((int) ($res['status'] ?? 0) === 200 && ! empty($res['success'])) {
            cache()->put($key.':'.$this->tenantId, true, 600);

            return true;
        }

        return filled($res['error'] ?? null) ? (string) $res['error'] : __('marketplace.request_unauthorized');
    }

    public function productPayload(Product $product, ?ProductVariant $variant, bool $expand): array
    {
        $c = $this->catalog();
        $prices = $c->prices($product, $variant, 'zarehbin');
        $inStock = $c->inStock($product, $variant);
        $attributes = [];
        foreach ($c->spec($product, $variant) as $title => $value) {
            if ($title === 'شناسه کالا') {
                continue;
            }
            $attributes[] = ['title' => $title, 'value' => $value];
        }

        return [
            'id' => $c->pageUnique($product, $variant),
            'sku' => (string) ($variant?->sku ?: $product->sku),
            'title' => $c->title($product, $variant, $expand),
            'stock' => $inStock ? 'instock' : 'outofstock',
            'regular_price' => $prices['old'],
            'sale_price' => $prices['current'] < $prices['old'] ? $prices['current'] : 0,
            'categories' => $c->categoryNames($product),
            'images' => $c->images($product, $variant),
            'url' => $c->productUrl($product, $variant),
            'attributes' => $attributes,
        ];
    }
}
