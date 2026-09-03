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

        $products = $productsQuery->get()->map(fn (Product $p) => $this->serializeProduct($p, true));

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

        $data = $this->serializeProduct($product, true);
        $data['likes_count'] = $likesCount;

        return response()->json([
            'data' => $data,
        ])->header('Cache-Control', 'public, max-age=60, s-maxage=120');
    }
}
