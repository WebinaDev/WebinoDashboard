<?php

namespace App\Services\Marketplace;

use App\Models\Product;
use App\Models\ProductAttributeTerm;
use App\Models\ProductVariant;
use App\Models\Tenant;
use Illuminate\Support\Collection;

/**
 * Builds crawler-feed rows (Torob / Emalls / Zarehbin / SnappPay search) from the tenant catalog.
 * An entry is a product, or one variant of it when variation expansion is on.
 */
class FeedCatalog
{
    public const GUARANTEE_KEYS = ['گارانتی', 'guarantee', 'warranty', 'garanty', 'گارانتی:', 'گارانتی محصول', 'گارانتی محصول:', 'ضمانت', 'ضمانت:'];

    public const REGISTRY_KEYS = ['رجیستری', 'registry', 'ریجیستری', 'ریجستری'];

    protected Tenant $tenant;

    protected MarketplacePricing $pricing;

    /** @var array<int, string> */
    protected array $termNames = [];

    public function __construct(int $tenantId, protected MarketplaceSettingsService $settings)
    {
        $this->tenant = Tenant::query()->findOrFail($tenantId);
        $this->pricing = MarketplacePricing::forTenant($tenantId);
    }

    public static function for(int $tenantId): self
    {
        return app()->make(self::class, ['tenantId' => $tenantId]);
    }

    public function tenant(): Tenant
    {
        return $this->tenant;
    }

    public function pricing(): MarketplacePricing
    {
        return $this->pricing;
    }

    public function siteDomain(): string
    {
        $host = (string) ($this->tenant->domain ?: parse_url((string) config('app.url'), PHP_URL_HOST));
        $host = preg_replace('#^https?://#', '', rtrim($host, '/'));

        return preg_replace('#^www\.#', '', explode('/', (string) $host)[0]);
    }

    public function siteUrl(): string
    {
        return 'https://'.$this->siteDomain();
    }

    public function absoluteUrl(?string $url): ?string
    {
        if (! $url) {
            return null;
        }
        if (preg_match('#^https?://#i', $url)) {
            return $url;
        }

        return $this->siteUrl().'/'.ltrim($url, '/');
    }

    public function productUrl(Product $product, ?ProductVariant $variant = null): string
    {
        $general = $this->settings->bucket($this->tenant->id, 'general', ['product_url_pattern' => '/shop/{slug}']);
        $pattern = (string) ($general['product_url_pattern'] ?: '/shop/{slug}');
        $path = str_replace(['{slug}', '{id}'], [rawurlencode((string) $product->slug), (string) $product->id], $pattern);
        $url = $this->absoluteUrl($path);

        return $variant ? $url.(str_contains($url, '?') ? '&' : '?').'variant='.$variant->id : $url;
    }

    public function pageUnique(Product $product, ?ProductVariant $variant = null): string
    {
        return $variant ? $product->id.'-'.$variant->id : (string) $product->id;
    }

    /** @return array{0: Product, 1: ProductVariant|null}|null */
    public function resolvePageUnique(string $unique): ?array
    {
        if (preg_match('/^(\d+)-(\d+)$/', trim($unique), $m)) {
            $product = $this->baseQuery()->find((int) $m[1]);
            $variant = $product ? ProductVariant::query()->where('product_id', $product->id)->find((int) $m[2]) : null;

            return $product && $variant ? [$product, $variant] : null;
        }
        $product = ctype_digit(trim($unique)) ? $this->baseQuery()->find((int) $unique) : null;

        return $product ? [$product, null] : null;
    }

    /** @return array{0: Product, 1: ProductVariant|null}|null */
    public function resolveUrl(string $url): ?array
    {
        $query = [];
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $path = trim((string) parse_url($url, PHP_URL_PATH), '/');
        if ($path === '') {
            return null;
        }
        $slug = rawurldecode(basename($path));
        $product = $this->baseQuery()->where('slug', $slug)->first()
            ?? (ctype_digit($slug) ? $this->baseQuery()->find((int) $slug) : null);
        if (! $product) {
            return null;
        }
        $variant = isset($query['variant']) ? ProductVariant::query()->where('product_id', $product->id)->find((int) $query['variant']) : null;

        return [$product, $variant];
    }

    public function baseQuery()
    {
        return Product::query()
            ->where('tenant_id', $this->tenant->id)
            ->where('status', 'publish')
            ->where(fn ($q) => $q->whereNull('is_hidden')->orWhere('is_hidden', false));
    }

    /**
     * Paginated entries.
     *
     * @return array{entries: list<array{0: Product, 1: ProductVariant|null}>, total: int, max_pages: int}
     */
    public function page(int $page, int $perPage, bool $expand, string $sort = 'id_desc'): array
    {
        $perPage = max(1, $perPage);
        $page = max(1, $page);
        $order = match ($sort) {
            'date_added_desc' => 'created_at',
            'date_updated_desc' => 'updated_at',
            default => 'id',
        };

        $products = $this->baseQuery()->orderByDesc($order)->orderByDesc('id')->get(['id', 'type', 'created_at', 'updated_at']);
        $variantsByProduct = $expand
            ? ProductVariant::query()->whereIn('product_id', $products->pluck('id'))->orderBy('sort_order')->get(['id', 'product_id'])->groupBy('product_id')
            : collect();

        $keys = [];
        foreach ($products as $p) {
            $vs = $variantsByProduct->get($p->id);
            if ($expand && $vs && $vs->isNotEmpty()) {
                foreach ($vs as $v) {
                    $keys[] = [$p->id, $v->id];
                }
            } else {
                $keys[] = [$p->id, null];
            }
        }

        $total = count($keys);
        $slice = array_slice($keys, ($page - 1) * $perPage, $perPage);
        $loadedProducts = Product::query()->with(['category', 'categories', 'brands', 'attributes', 'media'])->whereIn('id', array_unique(array_column($slice, 0)))->get()->keyBy('id');
        $variantIds = array_filter(array_column($slice, 1));
        $loadedVariants = $variantIds ? ProductVariant::query()->whereIn('id', $variantIds)->get()->keyBy('id') : collect();

        $entries = [];
        foreach ($slice as [$pid, $vid]) {
            $p = $loadedProducts->get($pid);
            if (! $p) {
                continue;
            }
            $entries[] = [$p, $vid ? $loadedVariants->get($vid) : null];
        }

        return ['entries' => $entries, 'total' => $total, 'max_pages' => max(1, (int) ceil($total / $perPage))];
    }

    /**
     * Entries for specific products (expanding variants when requested).
     *
     * @param  Collection<int, Product>  $products
     * @return list<array{0: Product, 1: ProductVariant|null}>
     */
    public function entriesFor(Collection $products, bool $expand): array
    {
        $out = [];
        foreach ($products as $p) {
            $p->loadMissing(['category', 'categories', 'brands', 'attributes', 'media']);
            $variants = $expand ? $p->variants()->get() : collect();
            if ($variants->isNotEmpty()) {
                foreach ($variants as $v) {
                    $out[] = [$p, $v];
                }
            } else {
                $out[] = [$p, null];
            }
        }

        return $out;
    }

    public function title(Product $product, ?ProductVariant $variant, bool $expand = true): string
    {
        if ($variant && $expand && filled($variant->name)) {
            return trim($product->name.' - '.$variant->name);
        }

        return (string) $product->name;
    }

    public function inStock(Product $product, ?ProductVariant $variant): bool
    {
        if ($product->is_sold_out || $product->is_available === false) {
            return false;
        }

        return $this->pricing->stockFor($product, $variant) > 0;
    }

    /** @return array{current: int, old: int} Prices in the platform's remote unit. */
    public function prices(Product $product, ?ProductVariant $variant, string $platform): array
    {
        $current = $this->pricing->priceFor($product, $variant, $platform);
        $src = $variant ?? $product;
        $regular = $this->pricing->toRemote((float) ($src->price_minor ?: $product->price_minor), $platform, $product->currency ?: null);

        return ['current' => $current, 'old' => $regular > $current ? $regular : $current];
    }

    public function categoryName(Product $product): string
    {
        return (string) ($product->category?->name ?? $product->categories->last()?->name ?? '');
    }

    /** @return list<string> */
    public function categoryNames(Product $product): array
    {
        $names = $product->categories->pluck('name')->all();
        if ($product->category && ! in_array($product->category->name, $names, true)) {
            array_unshift($names, $product->category->name);
        }

        return array_values(array_filter($names));
    }

    public function brandName(Product $product): string
    {
        return (string) ($product->brands->first()?->name ?? '');
    }

    /** @return list<string> */
    public function images(Product $product, ?ProductVariant $variant = null): array
    {
        $urls = [];
        foreach ([$variant?->image_url, $product->image_url, $product->cover_image_url] as $u) {
            if ($u) {
                $urls[] = $u;
            }
        }
        foreach ((array) ($product->gallery ?? []) as $g) {
            $u = is_array($g) ? ($g['url'] ?? $g['src'] ?? null) : $g;
            if (is_string($u) && $u !== '') {
                $urls[] = $u;
            }
        }
        foreach ($product->media as $m) {
            if (($m->type ?? 'image') === 'image' && $m->url) {
                $urls[] = $m->url;
            }
        }

        return array_values(array_unique(array_filter(array_map(fn ($u) => $this->absoluteUrl($u), $urls))));
    }

    /** @return array<string, string> Visible attributes (plus variant values) keyed by label. */
    public function spec(Product $product, ?ProductVariant $variant = null): array
    {
        $spec = [];
        if ($variant) {
            foreach ((array) ($variant->attribute_values ?? []) as $key => $av) {
                if (is_array($av)) {
                    $label = (string) ($av['attribute_name'] ?? $key);
                    $value = (string) ($av['term_name'] ?? $av['value'] ?? '');
                } else {
                    $label = (string) $key;
                    $value = (string) $av;
                }
                if ($label !== '' && $value !== '') {
                    $spec[$label] = $value;
                }
            }
        }
        foreach ($product->attributes as $attr) {
            $pivot = $attr->pivot;
            if ($pivot && isset($pivot->is_visible) && ! $pivot->is_visible) {
                continue;
            }
            $termIds = is_array($pivot?->term_ids) ? $pivot->term_ids : (json_decode((string) ($pivot?->term_ids ?? '[]'), true) ?: []);
            $values = array_filter(array_map(fn ($id) => $this->termName((int) $id), $termIds));
            $custom = is_array($pivot?->custom_options) ? $pivot->custom_options : (json_decode((string) ($pivot?->custom_options ?? '[]'), true) ?: []);
            foreach ($custom as $c) {
                $values[] = is_array($c) ? (string) ($c['name'] ?? $c['value'] ?? '') : (string) $c;
            }
            $values = array_values(array_filter($values));
            if ($values && ! array_key_exists($attr->name, $spec)) {
                $spec[$attr->name] = implode(', ', $values);
            }
        }
        $sku = (string) ($variant?->sku ?: $product->sku);
        if ($sku !== '' && ! array_key_exists('شناسه کالا', $spec)) {
            $spec['شناسه کالا'] = $sku;
        }

        return $spec;
    }

    protected function termName(int $id): string
    {
        if (! array_key_exists($id, $this->termNames)) {
            $this->termNames[$id] = (string) (ProductAttributeTerm::query()->whereKey($id)->value('name') ?? '');
        }

        return $this->termNames[$id];
    }

    /** @param  array<string, string>  $spec */
    public function pickSpec(array $spec, array $keys): string
    {
        $found = '';
        foreach ($keys as $k) {
            if (! empty($spec[$k])) {
                $found = (string) $spec[$k];
            }
        }

        return $found;
    }

    public function shortDesc(Product $product): string
    {
        return trim(strip_tags((string) ($product->short_description ?? '')));
    }

    public function stockStatus(Product $product, ?ProductVariant $variant): string
    {
        return $this->inStock($product, $variant) ? 'instock' : 'outofstock';
    }

    /** @return array<string, mixed> */
    public function platformSettings(string $platform): array
    {
        return $this->settings->raw($this->tenant->id, $platform);
    }
}
