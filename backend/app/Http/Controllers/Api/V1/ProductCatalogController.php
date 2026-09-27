<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProductCatalogController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = trim((string) $request->query('q', ''));
        $local = Product::query()->where('tenant_id', $tid);
        if ($q !== '') {
            $like = '%'.$q.'%';
            $local->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)->orWhere('sku', 'like', $like);
            });
        }
        $items = $local->orderBy('name')->limit(30)->get(['id', 'name', 'sku', 'price_minor', 'currency', 'slug']);

        return response()->json([
            'data' => [
                'local' => $items,
                'external' => [],
                'query' => $q,
            ],
        ]);
    }

    public function import(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'sku' => ['nullable', 'string', 'max:64'],
            'price_minor' => ['nullable', 'integer', 'min:0'],
        ]);
        $slug = Str::slug($data['name']);
        $base = $slug !== '' ? $slug : 'product';
        $slug = $this->uniqueSlug($tid, $base);

        $product = Product::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $slug,
            'sku' => $data['sku'] ?? null,
            'price_minor' => (int) ($data['price_minor'] ?? 0),
            'currency' => $request->user()->tenant?->default_currency ?? 'IRT',
            'status' => 'publish',
            'type' => 'simple',
            'stock' => 0,
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => false,
        ]);

        return response()->json(['data' => $product], 201);
    }

    private function uniqueSlug(int $tenantId, string $slug): string
    {
        $candidate = $slug;
        $i = 0;
        while (Product::query()->where('tenant_id', $tenantId)->where('slug', $candidate)->exists()) {
            $i++;
            $candidate = $slug.'-'.$i;
        }

        return $candidate;
    }
}
