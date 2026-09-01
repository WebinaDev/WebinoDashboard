<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\Request;

class PublicCatalogController extends Controller
{
    use ResolvesPublicTenant;

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $q = trim((string) $request->query('q', ''));

        $categories = Category::query()
            ->where('tenant_id', $tid)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $productsQuery = Product::query()
            ->where('tenant_id', $tid)
            ->where('is_hidden', false)
            ->with(['category', 'variants' => fn ($q) => $q->orderBy('sort_order')])
            ->orderBy('sort_order')
            ->orderBy('name');

        if ($q !== '') {
            $productsQuery->where(function ($builder) use ($q) {
                $builder->where('name', 'like', "%{$q}%")
                    ->orWhere('description', 'like', "%{$q}%");
            });
        }

        $products = $productsQuery->get()->map(fn (Product $p) => $this->serializeProduct($p));

        return response()->json([
            'data' => [
                'categories' => $categories,
                'items' => $products,
                'query' => $q !== '' ? $q : null,
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
            ->with(['category', 'variants' => fn ($q) => $q->orderBy('sort_order')])
            ->firstOrFail();

        return response()->json([
            'data' => $this->serializeProduct($product),
        ])->header('Cache-Control', 'public, max-age=60, s-maxage=120');
    }

    /** @return array<string, mixed> */
    private function serializeProduct(Product $product): array
    {
        $discounted = $product->discount_percent > 0
            ? (int) round($product->price_minor * (100 - $product->discount_percent) / 100)
            : $product->price_minor;

        return [
            'id' => $product->id,
            'slug' => $product->slug,
            'name' => $product->name,
            'description' => $product->description,
            'image_url' => $product->image_url,
            'price_minor' => $product->price_minor,
            'discounted_price_minor' => $discounted,
            'currency' => $product->currency,
            'is_available' => $product->is_available,
            'is_new' => $product->is_new,
            'discount_percent' => $product->discount_percent,
            'category' => $product->category,
            'variants' => $product->variants,
        ];
    }
}
