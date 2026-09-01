<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = Product::query()
            ->where('tenant_id', $tid)
            ->with(['category', 'variants'])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'sku' => ['nullable', 'string', 'max:255'],
            'category_id' => ['nullable', 'integer', Rule::exists('categories', 'id')->where('tenant_id', $tid)],
            'price_minor' => ['required', 'integer', 'min:0'],
            'currency' => ['nullable', 'string', 'max:8'],
            'stock' => ['nullable', 'integer', 'min:0'],
            'is_available' => ['nullable', 'boolean'],
            'is_hidden' => ['nullable', 'boolean'],
            'is_new' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'discount_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'meta' => ['nullable', 'array'],
        ]);

        $slug = $data['slug'] ?? Str::slug($data['name']);
        $slug = $this->ensureUniqueSlug($tid, $slug);

        $product = Product::query()->create([
            'tenant_id' => $tid,
            'category_id' => $data['category_id'] ?? null,
            'name' => $data['name'],
            'slug' => $slug,
            'description' => $data['description'] ?? null,
            'image_url' => $data['image_url'] ?? null,
            'sku' => $data['sku'] ?? null,
            'price_minor' => $data['price_minor'],
            'currency' => $data['currency'] ?? 'IRR',
            'stock' => $data['stock'] ?? 0,
            'is_available' => $data['is_available'] ?? true,
            'is_hidden' => $data['is_hidden'] ?? false,
            'is_new' => $data['is_new'] ?? false,
            'sort_order' => $data['sort_order'] ?? 0,
            'discount_percent' => $data['discount_percent'] ?? 0,
            'meta' => $data['meta'] ?? null,
        ]);

        return response()->json(['data' => $product->load(['category', 'variants'])], 201);
    }

    public function update(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);

        $tid = $request->user()->tenant_id;

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'image_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'sku' => ['sometimes', 'nullable', 'string', 'max:255'],
            'category_id' => ['sometimes', 'nullable', 'integer', Rule::exists('categories', 'id')->where('tenant_id', $tid)],
            'price_minor' => ['sometimes', 'integer', 'min:0'],
            'currency' => ['sometimes', 'string', 'max:8'],
            'stock' => ['sometimes', 'integer', 'min:0'],
            'is_available' => ['sometimes', 'boolean'],
            'is_hidden' => ['sometimes', 'boolean'],
            'is_new' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'discount_percent' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'meta' => ['sometimes', 'nullable', 'array'],
        ]);

        if (isset($data['slug'])) {
            $data['slug'] = $this->ensureUniqueSlug($tid, $data['slug'], $product->id);
        } elseif (isset($data['name']) && ! $product->slug) {
            $data['slug'] = $this->ensureUniqueSlug($tid, Str::slug($data['name']), $product->id);
        }

        $product->update($data);

        return response()->json(['data' => $product->fresh()->load(['category', 'variants'])]);
    }

    public function destroy(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $product->delete();

        return response()->json([], 204);
    }

    private function ensureUniqueSlug(int $tenantId, string $slug, ?int $exceptId = null): string
    {
        $base = $slug !== '' ? $slug : 'item';
        $candidate = $base;
        $i = 1;

        while (
            Product::query()
                ->where('tenant_id', $tenantId)
                ->where('slug', $candidate)
                ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
                ->exists()
        ) {
            $candidate = $base.'-'.$i;
            $i++;
        }

        return $candidate;
    }
}
