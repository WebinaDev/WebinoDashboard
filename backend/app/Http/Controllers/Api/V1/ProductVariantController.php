<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductVariantController extends Controller
{
    public function index(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);

        $items = ProductVariant::query()
            ->where('tenant_id', $product->tenant_id)
            ->where('product_id', $product->id)
            ->orderBy('sort_order')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'price_minor' => ['required', 'integer', 'min:0'],
            'is_default' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $variant = ProductVariant::query()->create([
            'tenant_id' => $product->tenant_id,
            'product_id' => $product->id,
            'name' => $data['name'],
            'price_minor' => $data['price_minor'],
            'is_default' => $data['is_default'] ?? false,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        return response()->json(['data' => $variant], 201);
    }

    public function update(Request $request, ProductVariant $variant): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $variant->tenant_id, 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'price_minor' => ['sometimes', 'integer', 'min:0'],
            'is_default' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        $variant->update($data);

        return response()->json(['data' => $variant->fresh()]);
    }

    public function destroy(Request $request, ProductVariant $variant): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $variant->tenant_id, 403);
        $variant->delete();

        return response()->json([], 204);
    }
}
