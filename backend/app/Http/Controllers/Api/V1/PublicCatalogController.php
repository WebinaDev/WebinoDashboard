<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Api\V1\Concerns\SerializesCatalogProduct;
use App\Http\Controllers\Controller;
use App\Models\CafeBranch;
use App\Models\Category;
use App\Models\Menu;
use App\Models\MenuBanner;
use App\Models\Product;
use App\Models\ProductLike;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Pricing\PurchaseTypeService;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\Request;

class PublicCatalogController extends Controller
{
    use ResolvesPublicTenant;
    use SerializesCatalogProduct;

    public function index(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $q = trim((string) $request->query('q', ''));
        $menuSlug = trim((string) $request->query('menu', ''));
        $branchSlug = trim((string) $request->query('branch', ''));

        $categories = Category::query()
            ->where('tenant_id', $tid)
            ->where(function ($q) {
                $q->whereNull('status')->orWhere('status', 'publish');
            })
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $productsQuery = Product::query()
            ->where('tenant_id', $tid)
            ->storefront()
            ->with([
                'category',
                'brands' => fn ($q) => $q->select('brands.id', 'brands.name', 'brands.slug'),
                'variants' => fn ($q) => $q->orderBy('sort_order'),
                'media' => fn ($q) => $q->orderBy('sort_order'),
                'allergens',
                'modifiers' => fn ($q) => $q->with(['options' => fn ($oq) => $oq->orderBy('sort_order')])->orderBy('sort_order'),
            ])
            ->orderBy('sort_order')
            ->orderBy('name');

        if ($menuSlug !== '') {
            $menu = Menu::query()->where('tenant_id', $tid)->where('slug', $menuSlug)->where('is_active', true)->first();
            if ($menu) {
                $productsQuery->where(fn ($builder) => $builder->where('menu_id', $menu->id)->orWhereNull('menu_id'));
            }
        }

        if ($q !== '') {
            $productsQuery->where(function ($builder) use ($q) {
                $builder->where('name', 'like', "%{$q}%")
                    ->orWhere('description', 'like', "%{$q}%");
            });
        }

        $pricing = PurchaseTypeService::forTenant($tid);
        $productsSettings = ShopSettings::getProducts($tid);
        $generalSettings = ShopSettings::getGeneral($tid);
        $archive = ShopSettings::getArchive($tid);

        if (! $request->boolean('show_unavailable') && (! empty($productsSettings['hide_out_of_stock']) || $request->boolean('in_stock') || ($request->boolean('filter_in_stock') && ! empty($archive['filter_in_stock'])))) {
            $productsQuery->where(function ($builder) {
                $builder->whereNull('stock_status')
                    ->orWhere('stock_status', '!=', 'outofstock');
            })->where(function ($builder) {
                $builder->whereNull('stock')->orWhere('stock', '>', 0)->orWhere('manage_stock', false);
            });
        }

        if ($request->boolean('on_sale') && (! empty($archive['filter_on_sale']) || $request->boolean('builder'))) {
            $productsQuery->where(function ($builder) {
                $builder->where('discount_percent', '>', 0)
                    ->orWhere(fn ($sale) => $sale->whereNotNull('sale_price_minor')->saleWindowOpen());
            });
        }

        if ($request->filled('min_price') && (! empty($archive['filter_price']) || $request->boolean('builder'))) {
            $productsQuery->where('price_minor', '>=', (int) $request->query('min_price'));
        }
        if ($request->filled('max_price') && (! empty($archive['filter_price']) || $request->boolean('builder'))) {
            $productsQuery->where('price_minor', '<=', (int) $request->query('max_price'));
        }
        if ($request->filled('category')) {
            $cat = trim((string) $request->query('category'));
            $productsQuery->whereHas('category', fn ($q) => $q->where('slug', $cat)->orWhere('id', $cat));
        }

        if ($request->filled('brand')) {
            $brand = trim((string) $request->query('brand'));
            $productsQuery->whereHas('brands', fn ($q) => $q->where('slug', $brand)->orWhere('id', $brand));
        }

        // Advanced archive filters (builder `archive-filters`): tag slugs and attribute terms ("attr_slug:term_slug").
        if ($request->filled('tag')) {
            $tags = array_slice(array_filter(array_map('trim', explode(',', (string) $request->query('tag')))), 0, 10);
            if ($tags) {
                $productsQuery->whereHas('tags', fn ($q) => $q->whereIn('product_tags.slug', $tags));
            }
        }
        if ($request->filled('attr')) {
            $pairs = array_slice(array_filter(array_map('trim', explode(',', (string) $request->query('attr')))), 0, 10);
            foreach ($pairs as $pair) {
                [$attrSlug, $termSlug] = array_pad(explode(':', $pair, 2), 2, '');
                if ($attrSlug === '') {
                    continue;
                }
                $termId = $termSlug === '' ? null : \App\Models\ProductAttributeTerm::query()
                    ->where('tenant_id', $tid)
                    ->where('slug', $termSlug)
                    ->whereHas('attribute', fn ($a) => $a->where('slug', $attrSlug))
                    ->value('id');
                if ($termSlug !== '' && ! $termId) {
                    $productsQuery->whereRaw('1 = 0');
                    continue;
                }
                $productsQuery->whereHas('attributes', function ($q) use ($attrSlug, $termId) {
                    $q->where('product_attributes.slug', $attrSlug);
                    if ($termId) {
                        $q->where(fn ($t) => $t->whereJsonContains('product_attribute_product.term_ids', (int) $termId)
                            ->orWhereJsonContains('product_attribute_product.term_ids', (string) $termId));
                    }
                });
            }
        }

        $sort = (string) $request->query('sort', $archive['default_sort'] ?? 'newest');
        $productsQuery->reorder();
        match ($sort) {
            'price_asc' => $productsQuery->orderBy('price_minor'),
            'price_desc' => $productsQuery->orderByDesc('price_minor'),
            'popular' => $productsQuery->orderByDesc('views_count'),
            'best_selling' => $productsQuery->orderByDesc(
                \App\Models\OrderItem::query()
                    ->selectRaw('COALESCE(SUM(order_items.quantity), 0)')
                    ->join('orders', 'orders.id', '=', 'order_items.order_id')
                    ->whereColumn('order_items.product_id', 'products.id')
                    ->whereNotIn('orders.status', ['cancelled', 'canceled', 'failed', 'payment_failed', 'refunded', 'pending_payment', 'awaiting_gateway'])
            )->orderByDesc('id'),
            'menu' => $productsQuery->orderBy('sort_order')->orderBy('name'),
            default => $productsQuery->orderByDesc('id'),
        };

        $perPage = max(1, min(96, (int) $request->query('per_page', $archive['products_per_page'] ?? 12)));
        $page = max(1, (int) $request->query('page', 1));
        $total = (clone $productsQuery)->count();
        $products = $productsQuery->skip(($page - 1) * $perPage)->take($perPage)->get()
            ->map(fn (Product $p) => $this->withPricing($this->serializeProduct($p, true), $p, $pricing));

        $banners = MenuBanner::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->limit(3)
            ->get();

        $branches = CafeBranch::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        $menus = Menu::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get(['id', 'name', 'slug', 'menu_type', 'locale', 'description']);

        $hours = $settings->get($tid, 'cafe', 'hours', ModuleSettingsService::cafeHoursDefaults());
        $engagement = $settings->get($tid, 'cafe', 'engagement', ModuleSettingsService::cafeEngagementDefaults());

        return response()->json([
            'data' => [
                'categories' => $categories,
                'brands' => \App\Models\Brand::query()->where('tenant_id', $tid)->orderBy('name')->get(['id', 'name', 'slug']),
                'items' => $products,
                'menus' => $menus,
                'banners' => $banners,
                'branches' => $branches,
                'hours' => $hours,
                'engagement' => $engagement,
                'currency_display' => [
                    'currency' => $generalSettings['currency'],
                    'currency_position' => $generalSettings['currency_position'],
                    'thousand_separator' => $generalSettings['thousand_separator'],
                    'decimal_separator' => $generalSettings['decimal_separator'],
                    'price_decimals' => $generalSettings['price_decimals'],
                ],
                'archive' => $archive,
                'pagination' => [
                    'page' => $page,
                    'per_page' => $perPage,
                    'total' => $total,
                ],
                'query' => $q !== '' ? $q : null,
                'branch' => $branchSlug !== '' ? $branchSlug : null,
            ],
        ])->header('Cache-Control', 'no-cache, must-revalidate');
    }

    public function show(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);

        $product = Product::query()
            ->where('tenant_id', $tid)
            ->where('slug', $slug)
            ->storefront()
            ->with([
                'category',
                'brands' => fn ($q) => $q->select('brands.id', 'brands.name', 'brands.slug'),
                'variants' => fn ($q) => $q->orderBy('sort_order'),
                'media' => fn ($q) => $q->orderBy('sort_order'),
                'allergens',
                'modifiers' => fn ($q) => $q->with(['options' => fn ($oq) => $oq->orderBy('sort_order')])->orderBy('sort_order'),
            ])
            ->firstOrFail();

        $likesCount = ProductLike::query()->where('product_id', $product->id)->count();

        $data = $this->withPricing($this->serializeProduct($product, true), $product, PurchaseTypeService::forTenant($tid));
        $data['likes_count'] = $likesCount;
        $data['return_notice'] = $this->categoryReturnNotice($product->category);
        // Same price formatting as the catalogue list (item page used to fall back to defaults).
        $general = \App\Services\Shop\ShopSettings::getGeneral($tid);
        $data['currency_display'] = [
            'currency' => $general['currency'] ?? null,
            'currency_position' => $general['currency_position'] ?? null,
            'thousand_separator' => $general['thousand_separator'] ?? null,
            'decimal_separator' => $general['decimal_separator'] ?? null,
            'price_decimals' => $general['price_decimals'] ?? null,
        ];

        return response()->json([
            'data' => $data,
        ])->header('Cache-Control', 'no-cache, must-revalidate');
    }

    /** Upsells / cross-sells / related products chosen in the product editor (storefront-visible only, max 12). */
    public function linked(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $type = (string) $request->query('type', 'upsell');
        $column = ['upsell' => 'upsell_ids', 'cross_sell' => 'cross_sell_ids', 'related' => 'related_ids'][$type] ?? null;
        abort_if($column === null, 422, 'Invalid type');

        $product = Product::query()->where('tenant_id', $tid)->where('slug', $slug)->storefront()->firstOrFail();
        $ids = array_slice(array_values(array_filter(array_map('intval', (array) ($product->{$column} ?? [])))), 0, 12);
        $pricing = PurchaseTypeService::forTenant($tid);
        $rows = $ids === [] ? collect() : Product::query()
            ->where('tenant_id', $tid)
            ->whereIn('id', $ids)
            ->storefront()
            ->with(['category', 'brands' => fn ($q) => $q->select('brands.id', 'brands.name', 'brands.slug'), 'media' => fn ($q) => $q->orderBy('sort_order')])
            ->get()
            ->sortBy(fn (Product $p) => array_search($p->id, $ids, true))
            ->values()
            ->map(fn (Product $p) => $this->withPricing($this->serializeProduct($p, true), $p, $pricing));

        return response()->json(['data' => ['items' => $rows->all()]]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function withPricing(array $data, Product $product, PurchaseTypeService $pricing): array
    {
        $data['pricing'] = $pricing->productPricing($product);

        return $data;
    }

    /** Per-category return text (category meta.return_notice), inherited from the nearest ancestor that sets one. */
    private function categoryReturnNotice(?\App\Models\Category $category): ?string
    {
        $seen = [];
        for ($depth = 0; $category !== null && $depth < 8 && ! isset($seen[$category->id]); $depth++) {
            $seen[$category->id] = true;
            $text = is_array($category->meta) ? trim((string) ($category->meta['return_notice'] ?? '')) : '';
            if ($text !== '') {
                return mb_substr($text, 0, 1000);
            }
            $category = $category->parent_id
                ? \App\Models\Category::query()->where('tenant_id', $category->tenant_id)->find($category->parent_id)
                : null;
        }

        return null;
    }
}
