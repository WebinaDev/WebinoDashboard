<?php

namespace App\Services\ProductCatalog\Sources;

use App\Services\ProductCatalog\CatalogItemNormalizer;
use App\Services\ProductCatalog\CatalogSource;
use App\Services\ProductCatalog\ExternalCatalogHttp;
use RuntimeException;

/**
 * Torob public price-comparison catalog (v4 search API).
 * Distinct from the Torob seller feed connector (outbound product feed to Torob).
 */
final class TorobCatalogSource implements CatalogSource
{
    public function __construct(
        protected int $tenantId,
        protected ExternalCatalogHttp $http = new ExternalCatalogHttp,
    ) {}

    public function key(): string
    {
        return 'torob';
    }

    public function status(): string
    {
        return 'ready';
    }

    public function labelFa(): string
    {
        return 'ترب';
    }

    public function labelEn(): string
    {
        return 'Torob';
    }

    public function hintFa(): string
    {
        return 'جستجوی محصولات در موتور مقایسه قیمت ترب (API عمومی). لینک صفحه محصول ترب هم پذیرفته می‌شود.';
    }

    public function hintEn(): string
    {
        return 'Search Torob’s public price-comparison catalog. Pasting a Torob product URL also works.';
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
        $key = $this->extractKey($query);
        if ($key !== '') {
            $item = $this->fetchDetails($key, $currency);
            return [
                'items' => $item ? [$item] : [],
                'page' => 1,
                'has_more' => false,
                'status' => 'ready',
                'message' => null,
            ];
        }

        // Torob pages are 0-based.
        $url = 'https://api.torob.com/v4/base-product/search/?'.http_build_query([
            'query' => $query,
            'page' => $page - 1,
            'size' => 24,
        ]);
        $json = $this->http->getJson($this->tenantId, $url, ['api.torob.com', 'torob.com']);
        $rows = (array) ($json['results'] ?? []);
        $items = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $mapped = $this->mapRow($row, $currency);
            if ($mapped) {
                $items[] = $mapped;
            }
        }
        $hasMore = filled($json['next'] ?? null) || count($rows) >= 24;

        return [
            'items' => $items,
            'page' => $page,
            'has_more' => $hasMore,
            'status' => 'ready',
            'message' => null,
        ];
    }

    protected function extractKey(string $query): string
    {
        if (preg_match('#torob\.com/p/([A-Za-z0-9_-]+)#i', $query, $m)) {
            return $m[1];
        }
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $query)) {
            return $query;
        }

        return '';
    }

    /** @return array<string, mixed>|null */
    protected function fetchDetails(string $key, string $currency): ?array
    {
        $url = 'https://api.torob.com/v4/base-product/details/?prk='.rawurlencode($key);
        $json = $this->http->getJson($this->tenantId, $url, ['api.torob.com', 'torob.com']);
        if (! is_array($json) || empty($json['random_key'] ?? $json['name1'] ?? null)) {
            // Some responses nest under products / base_product.
            $json = is_array($json['products'][0] ?? null) ? $json['products'][0] : $json;
        }
        if (! is_array($json)) {
            return null;
        }

        return $this->mapRow($json, $currency);
    }

    /** @param  array<string, mixed>  $row */
    protected function mapRow(array $row, string $currency): ?array
    {
        $id = (string) ($row['random_key'] ?? '');
        $title = trim((string) ($row['name1'] ?? $row['name'] ?? ''));
        if ($id === '' || $title === '') {
            return null;
        }
        $raw = (float) ($row['price'] ?? 0);
        $path = (string) ($row['web_client_absolute_url'] ?? '');
        $url = $path !== ''
            ? (str_starts_with($path, 'http') ? $path : 'https://torob.com'.$path)
            : 'https://torob.com/p/'.$id.'/';
        $brand = '';
        if (preg_match('/^(\S+)/u', (string) ($row['name2'] ?? ''), $m)) {
            $brand = $m[1];
        }

        return CatalogItemNormalizer::item([
            'id' => $id,
            'source' => 'torob',
            'title' => $title,
            'brand' => $brand,
            'sku' => 'torob-'.substr($id, 0, 12),
            'image_url' => (string) ($row['image_url'] ?? ''),
            'url' => $url,
            'price_minor' => CatalogItemNormalizer::toStoreMinor($raw, 'toman', $currency),
            'currency' => $currency,
            'raw_price' => $raw > 0 ? $raw : null,
            'price_unit' => 'toman',
            'description' => (string) ($row['shop_text'] ?? ''),
        ]);
    }
}
