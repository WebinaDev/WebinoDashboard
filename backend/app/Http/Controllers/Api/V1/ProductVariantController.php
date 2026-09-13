<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Pricing\PricingCalculator;
use Illuminate\Http\Request;

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
        $data = $this->validateVariant($request, false);

        $variant = ProductVariant::query()->create(array_merge($data, [
            'tenant_id' => $product->tenant_id,
            'product_id' => $product->id,
            'is_default' => $data['is_default'] ?? false,
            'sort_order' => $data['sort_order'] ?? 0,
            'stock_status' => $data['stock_status'] ?? 'instock',
            'manage_stock' => $data['manage_stock'] ?? false,
            'lock_price' => $data['lock_price'] ?? false,
        ]));

        if (! empty($data['purchase_price_minor']) && empty($data['lock_price'])) {
            $calc = PricingCalculator::forTenant($product->tenant_id);
            $variant->update([
                'price_minor' => (int) round($calc->calculate((float) $data['purchase_price_minor'], 'retail')),
            ]);
        }

        return response()->json(['data' => $variant->fresh()], 201);
    }

    public function update(Request $request, ProductVariant $variant): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $variant->tenant_id, 403);
        $data = $this->validateVariant($request, true);
        $variant->update($data);

        if (array_key_exists('purchase_price_minor', $data) && ! ($data['lock_price'] ?? $variant->lock_price)) {
            if ($data['purchase_price_minor']) {
                $calc = PricingCalculator::forTenant($variant->tenant_id);
                $variant->update([
                    'price_minor' => (int) round($calc->calculate((float) $data['purchase_price_minor'], 'retail')),
                ]);
            }
        }

        return response()->json(['data' => $variant->fresh()]);
    }

    public function destroy(Request $request, ProductVariant $variant): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $variant->tenant_id, 403);
        $variant->delete();

        return response()->json([], 204);
    }

    public function destroyAll(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        ProductVariant::query()->where('product_id', $product->id)->delete();

        return response()->json([], 204);
    }

    public function bulk(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
            'price_minor' => ['sometimes', 'integer', 'min:0'],
            'stock' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'purchase_price_minor' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ]);
        $updates = collect($data)->except('ids')->all();
        ProductVariant::query()
            ->where('product_id', $product->id)
            ->whereIn('id', $data['ids'])
            ->update($updates);

        return response()->json([
            'data' => ProductVariant::query()->where('product_id', $product->id)->whereIn('id', $data['ids'])->get(),
        ]);
    }

    public function generate(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'dry_run' => ['nullable', 'boolean'],
            'axes' => ['required', 'array', 'min:1'],
            'axes.*.attribute_id' => ['required', 'integer'],
            'axes.*.attribute_name' => ['nullable', 'string'],
            'axes.*.terms' => ['required', 'array', 'min:1'],
            'axes.*.terms.*.id' => ['nullable', 'integer'],
            'axes.*.terms.*.name' => ['required', 'string'],
        ]);

        $combinations = [[]];
        foreach ($data['axes'] as $axis) {
            $next = [];
            foreach ($combinations as $combo) {
                foreach ($axis['terms'] as $term) {
                    $next[] = array_merge($combo, [
                        [
                            'attribute_id' => $axis['attribute_id'],
                            'attribute_name' => $axis['attribute_name'] ?? null,
                            'term_id' => $term['id'] ?? null,
                            'term_name' => $term['name'],
                        ],
                    ]);
                }
            }
            $combinations = $next;
        }

        if ($data['dry_run'] ?? false) {
            return response()->json([
                'data' => [
                    'count' => count($combinations),
                    'preview' => array_slice(array_map(fn ($c) => [
                        'name' => implode(' / ', array_column($c, 'term_name')),
                        'attribute_values' => $c,
                    ], $combinations), 0, 50),
                ],
            ]);
        }

        $created = [];
        foreach ($combinations as $i => $combo) {
            $name = implode(' / ', array_column($combo, 'term_name'));
            $created[] = ProductVariant::query()->create([
                'tenant_id' => $product->tenant_id,
                'product_id' => $product->id,
                'name' => $name,
                'price_minor' => $product->price_minor,
                'attribute_values' => $combo,
                'sort_order' => $i,
                'stock_status' => 'instock',
            ]);
        }
        $product->update(['type' => 'variable']);

        return response()->json(['data' => $created], 201);
    }

    public function setDefault(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate(['variant_id' => ['required', 'integer']]);
        ProductVariant::query()->where('product_id', $product->id)->update(['is_default' => false]);
        $variant = ProductVariant::query()
            ->where('product_id', $product->id)
            ->where('id', $data['variant_id'])
            ->firstOrFail();
        $variant->update(['is_default' => true]);

        return response()->json(['data' => $variant]);
    }

    /** @return array<string, mixed> */
    private function validateVariant(Request $request, bool $partial): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$req, 'string', 'max:255'],
            'sku' => ['nullable', 'string', 'max:255'],
            'price_minor' => [$partial ? 'sometimes' : 'required', 'integer', 'min:0'],
            'sale_price_minor' => ['nullable', 'integer', 'min:0'],
            'purchase_price_minor' => ['nullable', 'integer', 'min:0'],
            'lock_price' => ['nullable', 'boolean'],
            'stock' => ['nullable', 'integer', 'min:0'],
            'stock_status' => ['nullable', 'string', 'in:instock,outofstock,onbackorder'],
            'manage_stock' => ['nullable', 'boolean'],
            'attribute_values' => ['nullable', 'array'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'weight' => ['nullable', 'numeric'],
            'length' => ['nullable', 'numeric'],
            'width' => ['nullable', 'numeric'],
            'height' => ['nullable', 'numeric'],
            'wholesale_rule' => ['nullable', 'array'],
            'reference_url' => ['nullable', 'string', 'max:2048'],
            'platform_prices' => ['nullable', 'array'],
            'is_default' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
    }
}
