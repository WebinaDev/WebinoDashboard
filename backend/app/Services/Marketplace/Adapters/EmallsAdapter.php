<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\MarketplaceException;

/**
 * Emalls crawler feed (emalls_ext/v1/products), port of WNC_Emalls_Adapter/Feed.
 */
class EmallsAdapter extends FeedAdapter
{
    public const AUTH_URL = 'https://emalls.ir/swservice/wp_plugin.ashx';

    public const TOKEN_TTL = 3600;

    public function platform(): string
    {
        return 'emalls';
    }

    public function authUrl(): string
    {
        return self::AUTH_URL;
    }

    protected function probeBody(): array
    {
        return ['token' => 'webino-connectivity-probe', 'shop_domain' => $this->catalog()->siteDomain(), 'version' => (string) ($this->credentials()['version'] ?? '1.3.0')];
    }

    public function tokenCacheValid(string $token): bool
    {
        $s = $this->state();

        return $token !== '' && ($s['token'] ?? null) === $token && (time() - (int) ($s['token_time'] ?? 0)) < self::TOKEN_TTL;
    }

    /**
     * @return true|string true when valid, 'network' on transport error, 'invalid' otherwise
     */
    public function verifyToken(string $token): bool|string
    {
        $token = trim($token);
        if ($token === '') {
            return 'invalid';
        }
        try {
            $res = $this->postAuth([
                'token' => $token,
                'shop_domain' => $this->catalog()->siteDomain(),
                'version' => (string) ($this->credentials()['version'] ?? '1.3.0'),
            ], true);
        } catch (MarketplaceException $e) {
            if ($e->status === 0) {
                $this->putState(['token' => '---']);

                return 'network';
            }
            $res = $e->response;
        }
        if (! empty($res['success']) && ($res['message'] ?? '') === 'the token is valid') {
            $this->putState(['token' => $token, 'token_time' => time()]);

            return true;
        }
        $this->putState(['token' => '---']);

        return 'invalid';
    }

    public function metadata(): array
    {
        return [
            'wordpress_version' => null,
            'php_version' => PHP_VERSION,
            'plugin_version' => (string) ($this->credentials()['version'] ?? '1.3.0'),
            'woocommerce_version' => null,
            'libsodium_version' => defined('SODIUM_LIBRARY_VERSION') ? SODIUM_LIBRARY_VERSION : null,
            'platform' => 'webino-dashboard',
        ];
    }

    public function productPayload(Product $product, ?ProductVariant $variant, bool $expand): array
    {
        $c = $this->catalog();
        $prices = $c->prices($product, $variant, 'emalls');
        $spec = $c->spec($product, $variant);
        $images = $c->images($product, $variant);

        return [
            'title' => $c->title($product, $variant, $expand),
            'subtitle' => (string) ($product->english_name ?? ''),
            'parent_id' => $variant ? $product->id : 0,
            'page_unique' => $c->pageUnique($product, $variant),
            'current_price' => (string) $prices['current'],
            'old_price' => (string) $prices['old'],
            'availability' => $c->stockStatus($product, $variant),
            'category_name' => $c->categoryName($product),
            'image_link' => $images[0] ?? null,
            'image_links' => $images,
            'page_url' => $c->productUrl($product, $variant),
            'short_desc' => $c->shortDesc($product),
            'spec' => $spec ? [$spec] : [],
            'date_added' => $product->created_at?->toAtomString(),
            'date_updated' => ($variant?->updated_at ?? $product->updated_at)?->toAtomString(),
            'product_type' => $variant ? 'variation' : ((string) ($product->type ?: 'simple')),
            'registry' => $c->pickSpec($spec, \App\Services\Marketplace\FeedCatalog::REGISTRY_KEYS),
            'guarantee' => $c->pickSpec($spec, \App\Services\Marketplace\FeedCatalog::GUARANTEE_KEYS),
        ];
    }
}
