<?php

namespace App\Services\ProductCatalog\Sources;

use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\ProductCatalog\CatalogItemNormalizer;
use App\Services\ProductCatalog\CatalogSource;
use App\Services\ProductCatalog\ExternalCatalogHttp;
use RuntimeException;

/**
 * Technolife catalog access.
 *
 * Without seller credentials: paste a product URL / TLP-id / product-{id} and we read __NEXT_DATA__
 * (same approach as ReferencePriceService / WP WFCP adapter).
 *
 * With Marketplace → Technolife base_url + api_key: keyword search via the seller products API.
 */
final class TechnolifeCatalogSource implements CatalogSource
{
    public function __construct(
        protected int $tenantId,
        protected ExternalCatalogHttp $http = new ExternalCatalogHttp,
    ) {}

    public function key(): string
    {
        return 'technolife';
    }

    public function status(): string
    {
        return $this->hasSellerCredentials() ? 'ready' : 'needs_credentials';
    }

    public function labelFa(): string
    {
        return 'تکنولایف';
    }

    public function labelEn(): string
    {
        return 'Technolife';
    }

    public function hintFa(): string
    {
        if ($this->hasSellerCredentials()) {
            return 'جستجوی کلیدواژه از API فروشندگان فعال است. لینک محصول یا کد TLP هم پذیرفته می‌شود.';
        }

        return 'جستجوی متنی کاتالوگ عمومی پایدار نیست. لینک محصول تکنولایف یا کد TLP را وارد کنید، یا کلید API را در تنظیمات مارکت‌پلیس → تکنولایف ذخیره کنید.';
    }

    public function hintEn(): string
    {
        if ($this->hasSellerCredentials()) {
            return 'Seller API keyword search is enabled. Product URLs / TLP codes also work.';
        }

        return 'Public keyword search is unreliable. Paste a Technolife product URL or TLP code, or add an API key under Marketplace → Technolife.';
    }

    public function settingsPath(): string
    {
        return 'settings/shop/marketplace/technolife';
    }

    public function search(string $query, int $page = 1): array
    {
        $query = trim($query);
        $page = max(1, $page);
        if ($query === '') {
            throw new RuntimeException(__('Enter a search term.'));
        }

        $currency = CatalogItemNormalizer::storeCurrency($this->tenantId);
        $url = $this->resolveProductUrl($query);
        if ($url !== null) {
            $item = $this->fetchFromPage($url, $currency);

            return [
                'items' => $item ? [$item] : [],
                'page' => 1,
                'has_more' => false,
                'status' => 'ready',
                'message' => $item ? null : __('Technolife product info not found.'),
            ];
        }

        if ($this->hasSellerCredentials()) {
            return $this->searchSellerApi($query, $page, $currency);
        }

        return [
            'items' => [],
            'page' => $page,
            'has_more' => false,
            'status' => 'needs_credentials',
            'message' => __('Technolife keyword search needs a product URL/TLP code, or seller API credentials in Marketplace settings.'),
        ];
    }

    /**
     * @return array{
     *   items: list<array<string, mixed>>,
     *   page: int,
     *   has_more: bool,
     *   status: string,
     *   message?: string|null
     * }
     */
    protected function searchSellerApi(string $query, int $page, string $currency): array
    {
        try {
            $rows = MarketplaceAdapterRegistry::make('technolife', $this->tenantId)
                ->searchProducts($query, $page);
        } catch (MarketplaceException $e) {
            throw new RuntimeException($e->getMessage());
        }

        $items = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $id = (string) ($row['id'] ?? $row['variant_id'] ?? '');
            $title = trim((string) ($row['title'] ?? ''));
            if ($id === '' || $title === '') {
                continue;
            }
            $raw = (float) ($row['price'] ?? 0);
            $items[] = CatalogItemNormalizer::item([
                'id' => $id,
                'source' => 'technolife',
                'title' => $title,
                'brand' => '',
                'sku' => 'tl-'.$id,
                'image_url' => '',
                'url' => 'https://www.technolife.com/product-'.$id,
                'price_minor' => CatalogItemNormalizer::toStoreMinor($raw, 'toman', $currency),
                'currency' => $currency,
                'raw_price' => $raw > 0 ? $raw : null,
                'price_unit' => 'toman',
                'description' => '',
            ]);
        }

        return [
            'items' => $items,
            'page' => $page,
            'has_more' => count($rows) >= 20,
            'status' => 'ready',
            'message' => null,
        ];
    }

    protected function hasSellerCredentials(): bool
    {
        $creds = app(MarketplaceSettingsService::class)->credentials($this->tenantId, 'technolife');

        return filled($creds['base_url'] ?? null) && filled($creds['api_key'] ?? null);
    }

    protected function resolveProductUrl(string $query): ?string
    {
        if (preg_match('#https?://(?:www\.)?technolife\.(?:com|ir)/\S+#i', $query, $m)) {
            return $m[0];
        }
        if (preg_match('/TLP-?(\d+)/i', $query, $m)) {
            return 'https://www.technolife.com/product-'.$m[1];
        }
        if (preg_match('/(?:^|[^\d])product-(\d+)/i', $query, $m) || preg_match('/^(\d{4,})$/', $query, $m)) {
            return 'https://www.technolife.com/product-'.$m[1];
        }

        return null;
    }

    /** @return array<string, mixed>|null */
    protected function fetchFromPage(string $url, string $currency): ?array
    {
        $html = $this->http->getBody($this->tenantId, $url, ['technolife.com', 'technolife.ir']);
        if (! preg_match('/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s', $html, $m)) {
            return null;
        }
        $next = json_decode($m[1], true);
        if (! is_array($next)) {
            return null;
        }

        $info = null;
        foreach ((array) data_get($next, 'props.pageProps.dehydratedState.queries', []) as $q) {
            if (is_array(data_get($q, 'state.data.product_info'))) {
                $info = data_get($q, 'state.data.product_info');
                break;
            }
        }
        if (! is_array($info)) {
            return null;
        }

        $title = trim((string) ($info['title'] ?? $info['name'] ?? $info['product_name'] ?? ''));
        $id = (string) ($info['id'] ?? $info['product_id'] ?? '');
        if ($title === '') {
            return null;
        }
        $items = (array) ($info['color_items'] ?? []);
        $pick = null;
        foreach ($items as $it) {
            if (is_array($it) && (float) ($it['available'] ?? 0) > 0) {
                $pick = $it;
                break;
            }
        }
        $pick ??= is_array($items[0] ?? null) ? $items[0] : null;
        $raw = 0.0;
        if (is_array($pick)) {
            $raw = (float) ($pick['discounted_price'] ?? 0) ?: (float) ($pick['price'] ?? 0);
        }
        $image = (string) ($info['image'] ?? $info['image_url'] ?? data_get($info, 'images.0') ?? '');
        if ($image === '' && is_array($pick)) {
            $image = (string) ($pick['image'] ?? $pick['image_url'] ?? '');
        }
        $brand = (string) ($info['brand'] ?? $info['brand_name'] ?? data_get($info, 'brand.title') ?? '');
        $canonical = preg_match('#product-(\d+)#i', $url, $pm)
            ? 'https://www.technolife.com/product-'.$pm[1]
            : $url;

        return CatalogItemNormalizer::item([
            'id' => $id !== '' ? $id : (string) ($pm[1] ?? md5($title)),
            'source' => 'technolife',
            'title' => $title,
            'brand' => $brand,
            'sku' => $id !== '' ? 'tl-'.$id : ('tl-'.($pm[1] ?? substr(md5($title), 0, 8))),
            'image_url' => $image,
            'url' => $canonical,
            'price_minor' => CatalogItemNormalizer::toStoreMinor($raw, 'toman', $currency),
            'currency' => $currency,
            'raw_price' => $raw > 0 ? $raw : null,
            'price_unit' => 'toman',
            'description' => (string) ($info['description'] ?? $info['short_description'] ?? ''),
        ]);
    }
}
