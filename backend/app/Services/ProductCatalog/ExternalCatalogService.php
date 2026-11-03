<?php

namespace App\Services\ProductCatalog;

use App\Models\Brand;
use App\Models\Product;
use App\Services\ProductCatalog\Sources\DigikalaCatalogSource;
use App\Services\ProductCatalog\Sources\TechnolifeCatalogSource;
use App\Services\ProductCatalog\Sources\TorobCatalogSource;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * External product-database hub: search Digikala / Torob / Technolife and import into local products.
 * Not a duplicate of the local /dashboard/products browser.
 */
final class ExternalCatalogService
{
    public function __construct(protected int $tenantId) {}

    /** @return list<CatalogSource> */
    public function sources(): array
    {
        return [
            new DigikalaCatalogSource($this->tenantId),
            new TorobCatalogSource($this->tenantId),
            new TechnolifeCatalogSource($this->tenantId),
        ];
    }

    public function source(string $key): CatalogSource
    {
        foreach ($this->sources() as $source) {
            if ($source->key() === $key) {
                return $source;
            }
        }
        throw new RuntimeException(__('Unknown catalog source.'));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function sourceMeta(string $locale = 'fa'): array
    {
        $out = [];
        foreach ($this->sources() as $source) {
            $settings = $source->settingsPath();
            $out[] = [
                'key' => $source->key(),
                'status' => $source->status(),
                'label' => $locale === 'en' ? $source->labelEn() : $source->labelFa(),
                'hint' => $locale === 'en' ? $source->hintEn() : $source->hintFa(),
                'settings_path' => $settings !== '' ? $settings : null,
            ];
        }

        return $out;
    }

    /**
     * @return array{
     *   items: list<array<string, mixed>>,
     *   page: int,
     *   has_more: bool,
     *   status: string,
     *   message?: string|null,
     *   source: string,
     *   query: string
     * }
     */
    public function search(string $sourceKey, string $query, int $page = 1): array
    {
        $source = $this->source($sourceKey);
        $result = $source->search($query, $page);

        return array_merge($result, [
            'source' => $source->key(),
            'query' => $query,
        ]);
    }

    /**
     * Create or update a local product from a catalog card payload.
     *
     * @param  array<string, mixed>  $payload
     * @return array{product: Product, created: bool}
     */
    public function import(array $payload): array
    {
        $name = trim((string) ($payload['name'] ?? $payload['title'] ?? ''));
        if ($name === '') {
            throw new RuntimeException(__('Product title is required.'));
        }
        $source = trim((string) ($payload['source'] ?? ''));
        $remoteId = trim((string) ($payload['id'] ?? $payload['remote_id'] ?? ''));
        $sku = trim((string) ($payload['sku'] ?? ''));
        if ($sku === '' && $source !== '' && $remoteId !== '') {
            $sku = $source.'-'.$remoteId;
        }
        $currency = CatalogItemNormalizer::storeCurrency($this->tenantId);
        $price = max(0, (int) ($payload['price_minor'] ?? 0));
        $image = trim((string) ($payload['image_url'] ?? ''));
        $url = trim((string) ($payload['url'] ?? $payload['reference_url'] ?? ''));
        $brandName = trim((string) ($payload['brand'] ?? ''));
        $description = (string) ($payload['description'] ?? '');

        $existing = null;
        if ($sku !== '') {
            $existing = Product::query()->where('tenant_id', $this->tenantId)->where('sku', $sku)->first();
        }
        if (! $existing && $url !== '') {
            $existing = Product::query()->where('tenant_id', $this->tenantId)->where('reference_url', $url)->first();
        }

        $attrs = [
            'name' => $name,
            'sku' => $sku !== '' ? $sku : null,
            'price_minor' => $price,
            'currency' => $currency,
            'image_url' => $image !== '' ? $image : null,
            'description' => $description !== '' ? $description : null,
            'short_description' => $brandName !== '' ? $brandName : null,
            'reference_url' => $url !== '' ? $url : null,
            'reference_source' => $source !== '' ? $source : null,
            'type' => 'simple',
            'catalog_visibility' => 'visible',
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => false,
        ];

        if ($existing) {
            $existing->fill(array_filter($attrs, fn ($v) => $v !== null))->save();
            $product = $existing->fresh();
            $created = false;
        } else {
            $slug = $this->uniqueSlug(Str::slug($name) ?: 'product');
            $product = Product::query()->create(array_merge($attrs, [
                'tenant_id' => $this->tenantId,
                'slug' => $slug,
                'status' => 'draft',
                'stock' => 0,
                'manage_stock' => true,
            ]));
            $created = true;
        }

        if ($brandName !== '') {
            $this->attachBrand($product, $brandName);
        }

        return ['product' => $product, 'created' => $created];
    }

    protected function attachBrand(Product $product, string $brandName): void
    {
        $slug = Str::slug($brandName) ?: 'brand';
        $brand = Brand::query()->firstOrCreate(
            ['tenant_id' => $this->tenantId, 'slug' => $slug],
            ['name' => $brandName, 'status' => 'publish']
        );
        $product->brands()->syncWithoutDetaching([$brand->id]);
    }

    protected function uniqueSlug(string $base): string
    {
        $candidate = $base;
        $i = 0;
        while (Product::query()->where('tenant_id', $this->tenantId)->where('slug', $candidate)->exists()) {
            $i++;
            $candidate = $base.'-'.$i;
        }

        return $candidate;
    }
}
