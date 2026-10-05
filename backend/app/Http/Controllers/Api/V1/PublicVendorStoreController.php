<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\VendorStore;
use Illuminate\Http\Request;

class PublicVendorStoreController extends Controller
{
    use ResolvesPublicTenant;

    public function show(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $store = VendorStore::query()
            ->where('tenant_id', $tid)
            ->where('slug', $slug)
            ->whereIn('status', ['active', 'published', 'open'])
            ->firstOrFail();

        $products = Product::query()
            ->where('tenant_id', $tid)
            ->where('vendor_store_id', $store->id)
            ->storefront()
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'slug', 'name', 'price_minor', 'sale_price_minor', 'cover_image_url', 'image_url', 'discount_percent']);

        return response()->json([
            'data' => [
                'store' => [
                    'id' => $store->id,
                    'name' => $store->name,
                    'slug' => $store->slug,
                    'bio' => $store->bio,
                    'logo_url' => $store->logo_url,
                ],
                'products' => $products->map(fn (Product $p) => [
                    'id' => $p->id,
                    'slug' => $p->slug,
                    'name' => $p->name,
                    'price_minor' => $p->storefrontPriceMinor(),
                    'compare_at_minor' => $p->isOnSale() ? (int) $p->price_minor : null,
                    'image_url' => $p->cover_image_url ?: $p->image_url,
                    'discount_percent' => $p->discount_percent,
                ])->values(),
            ],
        ]);
    }
}
