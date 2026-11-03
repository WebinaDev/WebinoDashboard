<?php

namespace App\Services\ProductCatalog\Sources;

use App\Services\Pricing\ReferencePriceService;
use App\Services\ProductCatalog\CatalogItemNormalizer;
use App\Services\ProductCatalog\CatalogSource;
use App\Services\ProductCatalog\ExternalCatalogHttp;
use RuntimeException;

/**
 * Digikala public catalog (search + DKP lookup).
 * Uses api.digikala.com — same host family as ReferencePriceService / seller publicVariantAttrs.
 * No Digikala Seller Center credentials required for browse/import.
 */
final class DigikalaCatalogSource implements CatalogSource
{
    public function __construct(
        protected int $tenantId,
        protected ExternalCatalogHttp $http = new ExternalCatalogHttp,
    ) {}

    public function key(): string
    {
        return 'digikala';
    }

    public function status(): string
    {
        return 'ready';
    }

    public function labelFa(): string
    {
        return 'دیجی‌کالا';
    }

    public function labelEn(): string
    {
        return 'Digikala';
    }

    public function hintFa(): string
    {
        return 'جستجوی کاتالوگ عمومی دیجی‌کالا (بدون نیاز به پنل فروشندگان). می‌توانید DKP یا لینک محصول را هم وارد کنید.';
    }

    public function hintEn(): string
    {
        return 'Public Digikala catalog search (no Seller Center credentials). You can also paste a DKP or product URL.';
    }

    public function settingsPath(): string
    {
        return '';
    }

    public function search(string $query, int $page = 1): array
    {
        $query = trim($query);
        $page = max(1, $page);
        if ($query === '') {
            throw new RuntimeException(__('Enter a search term.'));
        }

        $currency = CatalogItemNormalizer::storeCurrency($this->tenantId);
        $dkp = ReferencePriceService::digikalaId($query);
        if ($dkp <= 0 && preg_match('/^(?:dkp-?)?(\d{5,})$/i', $query, $m)) {
            $dkp = (int) $m[1];
        }
        if ($dkp > 0) {
            $item = $this->fetchProduct($dkp, $currency);
            return [
                'items' => $item ? [$item] : [],
                'page' => 1,
                'has_more' => false,
                'status' => 'ready',
                'message' => null,
            ];
        }

        $url = 'https://api.digikala.com/v1/search/?'.http_build_query([
            'q' => $query,
            'page' => $page,
        ]);
        $json = $this->http->getJson($this->tenantId, $url, ['api.digikala.com', 'digikala.com']);
        $products = (array) data_get($json, 'data.products', []);
        $pager = (array) data_get($json, 'data.pager', []);
        $totalPages = max(1, (int) ($pager['total_pages'] ?? 1));
        $items = [];
        foreach ($products as $row) {
            if (! is_array($row)) {
                continue;
            }
            $mapped = $this->mapSearchRow($row, $currency);
            if ($mapped) {
                $items[] = $mapped;
            }
        }

        return [
            'items' => $items,
            'page' => $page,
            'has_more' => $page < $totalPages,
            'status' => 'ready',
            'message' => null,
        ];
    }

    /** @return array<string, mixed>|null */
    protected function fetchProduct(int $dkp, string $currency): ?array
    {
        $url = 'https://api.digikala.com/v2/product/'.$dkp.'/';
        $json = $this->http->getJson($this->tenantId, $url, ['api.digikala.com', 'digikala.com']);
        $product = data_get($json, 'data.product');
        if (! is_array($product)) {
            return null;
        }

        return $this->mapSearchRow($product, $currency);
    }

    /** @param  array<string, mixed>  $row */
    protected function mapSearchRow(array $row, string $currency): ?array
    {
        $id = (string) ($row['id'] ?? '');
        $title = trim((string) ($row['title_fa'] ?? $row['title_en'] ?? $row['title'] ?? ''));
        if ($id === '' || $title === '') {
            return null;
        }
        $variant = is_array($row['default_variant'] ?? null) ? $row['default_variant'] : [];
        $raw = (float) data_get($variant, 'price.selling_price', 0);
        $image = '';
        $main = data_get($row, 'images.main.url');
        if (is_array($main) && isset($main[0])) {
            $image = (string) $main[0];
        } elseif (is_string($main)) {
            $image = $main;
        }
        $brand = (string) (data_get($row, 'data_layer.brand') ?: data_get($row, 'brand.title_fa') ?: '');
        $uri = (string) data_get($row, 'url.uri', '');
        $productUrl = $uri !== ''
            ? 'https://www.digikala.com'.(str_starts_with($uri, '/') ? $uri : '/'.$uri)
            : 'https://www.digikala.com/product/dkp-'.$id.'/';

        return CatalogItemNormalizer::item([
            'id' => $id,
            'source' => 'digikala',
            'title' => $title,
            'brand' => $brand,
            'sku' => 'dkp-'.$id,
            'image_url' => $image,
            'url' => $productUrl,
            'price_minor' => CatalogItemNormalizer::toStoreMinor($raw, 'rial', $currency),
            'currency' => $currency,
            'raw_price' => $raw > 0 ? $raw : null,
            'price_unit' => 'rial',
            'description' => (string) ($row['review']['description'] ?? ''),
        ]);
    }
}
