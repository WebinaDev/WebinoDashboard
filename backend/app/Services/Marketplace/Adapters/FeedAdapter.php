<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\FeedCatalog;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceHttp;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Base for crawler feeds: no push/pull, local catalog search, and remote auth-host probe.
 */
abstract class FeedAdapter extends BaseAdapter
{
    abstract public function authUrl(): string;

    /** @return array<string, mixed> Probe body sent to the auth host in testConnection(). */
    abstract protected function probeBody(): array;

    protected function probeAsForm(): bool
    {
        return true;
    }

    public function catalog(): FeedCatalog
    {
        return FeedCatalog::for($this->tenantId);
    }

    public function expand(): bool
    {
        return (bool) ($this->credentials()['expand_variations'] ?? false);
    }

    public function testConnection(): array
    {
        try {
            $pending = Http::timeout(12);
            $res = $this->probeAsForm()
                ? $pending->asForm()->post($this->authUrl(), $this->probeBody())
                : $pending->asJson()->post($this->authUrl(), $this->probeBody());
        } catch (ConnectionException $e) {
            throw new MarketplaceException(__('marketplace.feed_auth_unreachable').' '.$e->getMessage(), 0);
        }
        if ($res->status() < 100) {
            $this->fail(__('marketplace.feed_auth_invalid_response'));
        }

        return [
            'ok' => true,
            'message' => __('marketplace.feed_auth_reachable'),
            'details' => ['auth_status' => $res->status(), 'domain' => $this->catalog()->siteDomain()],
        ];
    }

    public function searchProducts(string $keyword = '', int $page = 1): array
    {
        $catalog = $this->catalog();
        $q = $catalog->baseQuery();
        if ($keyword !== '') {
            $q->where(fn ($w) => $w->where('name', 'like', "%{$keyword}%")->orWhere('sku', 'like', "%{$keyword}%"));
        }
        $out = [];
        foreach ($q->orderByDesc('id')->forPage($page, 20)->get() as $p) {
            $prices = $catalog->prices($p, null, $this->platform());
            $out[] = [
                'id' => (string) $p->id,
                'variant_id' => '',
                'title' => (string) $p->name,
                'price' => $prices['current'],
                'stock' => $catalog->pricing()->stockFor($p),
                'sku' => (string) $p->sku,
                'url' => $catalog->productUrl($p),
            ];
        }

        return $out;
    }

    /**
     * POST JSON/form to the platform auth host and return the decoded body.
     *
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    protected function postAuth(array $body, bool $form, int $timeout = 5): array
    {
        return MarketplaceHttp::request('POST', $this->authUrl(), ['body' => $body, 'form' => $form, 'timeout' => $timeout]);
    }

    /** @return array<string, mixed> */
    abstract public function productPayload(Product $product, ?ProductVariant $variant, bool $expand): array;
}
