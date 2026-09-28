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
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $productsQuery = Product::query()
            ->where('tenant_id', $tid)
            ->where('is_hidden', false)
            ->with([
                'category',
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

        if (! empty($productsSettings['hide_out_of_stock']) || $request->boolean('in_stock') || ($request->boolean('filter_in_stock') && ! empty($archive['filter_in_stock']))) {
            $productsQuery->where(function ($builder) {
                $builder->whereNull('stock_status')
                    ->orWhere('stock_status', '!=', 'outofstock');
            })->where(function ($builder) {
                $builder->whereNull('stock')->orWhere('stock', '>', 0)->orWhere('manage_stock', false);
            });
        }

        if ($request->boolean('on_sale') && ! empty($archive['filter_on_sale'])) {
            $productsQuery->where(function ($builder) {
                $builder->where('discount_percent', '>', 0)
                    ->orWhere(fn ($sale) => $sale->whereNotNull('sale_price_minor')->saleWindowOpen());
            });
        }

        if ($request->filled('min_price') && ! empty($archive['filter_price'])) {
            $productsQuery->where('price_minor', '>=', (int) $request->query('min_price'));
        }
        if ($request->filled('max_price') && ! empty($archive['filter_price'])) {
            $productsQuery->where('price_minor', '<=', (int) $request->query('max_price'));
        }
        if ($request->filled('category')) {
            $cat = trim((string) $request->query('category'));
            $productsQuery->whereHas('category', fn ($q) => $q->where('slug', $cat)->orWhere('id', $cat));
        }

        $sort = (string) $request->query('sort', $archive['default_sort'] ?? 'newest');
        $productsQuery->reorder();
        match ($sort) {
            'price_asc' => $productsQuery->orderBy('price_minor'),
            'price_desc' => $productsQuery->orderByDesc('price_minor'),
            'popular' => $productsQuery->orderByDesc('views_count'),
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
            ->get(['id', 'name', 'slug', 'menu_type', 'locale']);

        $hours = $settings->get($tid, 'cafe', 'hours', ModuleSettingsService::cafeHoursDefaults());
        $engagement = $settings->get($tid, 'cafe', 'engagement', ModuleSettingsService::cafeEngagementDefaults());

        return response()->json([
            'data' => [
                'categories' => $categories,
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
        ])->header('Cache-Control', 'public, max-age=60, s-maxage=120');
    }

    public function show(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);

        $product = Product::query()
            ->where('tenant_id', $tid)
            ->where('slug', $slug)
            ->where('is_hidden', false)
            ->with([
                'category',
                'variants' => fn ($q) => $q->orderBy('sort_order'),
                'media' => fn ($q) => $q->orderBy('sort_order'),
                'allergens',
                'modifiers' => fn ($q) => $q->with(['options' => fn ($oq) => $oq->orderBy('sort_order')])->orderBy('sort_order'),
            ])
            ->firstOrFail();

        $likesCount = ProductLike::query()->where('product_id', $product->id)->count();

        $data = $this->withPricing($this->serializeProduct($product, true), $product, PurchaseTypeService::forTenant($tid));
        $data['likes_count'] = $likesCount;

        return response()->json([
            'data' => $data,
        ])->header('Cache-Control', 'public, max-age=60, s-maxage=120');
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
}
