<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\MarketplaceException;

/**
 * SnappPay search (Searchwise) feed (v1/product/feed), port of WNC_SnappPay_Search_Adapter/Feed.
 */
class SnapppaySearchAdapter extends FeedAdapter
{
    public const AUTH_URL = 'https://merchants.searchwise.ir/api/v1/feed/validate-token';

    public function platform(): string
    {
        return 'snapppay-search';
    }

    public function authUrl(): string
    {
        return self::AUTH_URL;
    }

    protected function probeBody(): array
    {
        return ['merchant_domain' => $this->catalog()->siteDomain(), 'api_key' => 'webino-connectivity-probe', 'plugin_version' => (string) ($this->credentials()['version'] ?? '1.0.2')];
    }

    /** @return true|'network'|'invalid' */
    public function verifyApiKey(string $apiKey): bool|string
    {
        if (trim($apiKey) === '') {
            return 'invalid';
        }
        $key = 'sps_ok_'.$this->tenantId.'_'.md5($apiKey);
        if (cache()->get($key)) {
            return true;
        }
        try {
            $res = $this->postAuth([
                'merchant_domain' => $this->catalog()->siteDomain(),
                'api_key' => $apiKey,
                'plugin_version' => (string) ($this->credentials()['version'] ?? '1.0.2'),
            ], true);
        } catch (MarketplaceException $e) {
            if ($e->status === 0) {
                return 'network';
            }
            $res = $e->response;
        }
        if (($res['success'] ?? null) === true) {
            cache()->put($key, true, 600);

            return true;
        }

        return 'invalid';
    }

    public function productPayload(Product $product, ?ProductVariant $variant, bool $expand, bool $includeContent = false): array
    {
        $c = $this->catalog();
        $prices = $c->prices($product, $variant, 'snapppay-search');
        $spec = $c->spec($product, null);
        unset($spec['شناسه کالا']);
        $meta = (array) ($product->meta ?? []);

        $row = [
            'id' => $c->pageUnique($product, $variant),
            'slug' => (string) $product->slug,
            'title' => $c->title($product, $variant, $expand),
        ];
        if ($includeContent) {
            $row['content'] = (string) ($product->description ?? '');
        }

        return $row + [
            'regular_price' => (float) $prices['old'],
            'sale_price' => (float) $prices['current'],
            'availability' => $c->stockStatus($product, $variant),
            'category' => $c->categoryNames($product),
            'image_link' => $c->images($product, $variant),
            'link' => $c->productUrl($product, $variant),
            'short_description' => (string) ($product->short_description ?? ''),
            'description' => (object) $spec,
            'shipping_cost' => (float) ($meta['shipping_cost'] ?? 0),
            'delivery_time' => (int) ($meta['delivery_days'] ?? $product->shipping_time ?? 0),
            'brand' => $c->brandName($product),
        ];
    }
}
