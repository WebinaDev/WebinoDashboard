<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CoffeeOrigin;
use App\Models\CoffeeProfile;
use App\Models\CoffeeSetting;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Pricing\PricingCalculator;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CoffeeController extends Controller
{
    public function profileSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $this->getSetting($request->user()->tenant_id, 'profile')]);
    }

    public function updateProfileSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['payload' => ['required', 'array']]);

        return response()->json(['data' => $this->putSetting($request->user()->tenant_id, 'profile', $data['payload'])]);
    }

    public function pricingSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $this->getSetting($request->user()->tenant_id, 'pricing')]);
    }

    public function updatePricingSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['payload' => ['required', 'array']]);

        return response()->json(['data' => $this->putSetting($request->user()->tenant_id, 'pricing', $data['payload'])]);
    }

    public function blendSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $this->getSetting($request->user()->tenant_id, 'blend')]);
    }

    public function updateBlendSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['payload' => ['required', 'array']]);

        return response()->json(['data' => $this->putSetting($request->user()->tenant_id, 'blend', $data['payload'])]);
    }

    public function productProfile(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $profile = CoffeeProfile::query()->firstOrCreate(
            ['product_id' => $product->id],
            [
                'tenant_id' => $product->tenant_id,
                'visible' => [
                    'blend' => true, 'acidity' => true, 'caffeine' => true,
                    'bitterness' => true, 'sweetness' => true, 'body' => true, 'origin' => true,
                ],
                'blend_robusta' => 0,
                'blend_arabica' => 100,
                'price_mode' => 'none',
            ]
        );

        return response()->json(['data' => $profile]);
    }

    public function updateProductProfile(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'visible' => ['nullable', 'array'],
            'blend_robusta' => ['nullable', 'integer', 'min:0', 'max:100'],
            'blend_arabica' => ['nullable', 'integer', 'min:0', 'max:100'],
            'acidity' => ['nullable', 'array'],
            'caffeine_mg' => ['nullable', 'integer', 'min:0'],
            'bitterness' => ['nullable', 'integer', 'min:0', 'max:10'],
            'sweetness' => ['nullable', 'integer', 'min:0', 'max:10'],
            'body' => ['nullable', 'integer', 'min:0', 'max:10'],
            'pack_weight_g' => ['nullable', 'integer', 'min:0'],
            'price_mode' => ['nullable', 'string'],
            'price_parts' => ['nullable', 'array'],
            'origin_ids' => ['nullable', 'array'],
            'meta' => ['nullable', 'array'],
        ]);

        $profile = CoffeeProfile::query()->updateOrCreate(
            ['product_id' => $product->id],
            array_merge($data, ['tenant_id' => $product->tenant_id])
        );

        return response()->json(['data' => $profile]);
    }

    public function priceByAttribute(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);

        return response()->json([
            'data' => [
                'attribute_id' => $request->query('attribute_id'),
                'rows' => $product->variants()->get()->map(fn ($v) => [
                    'variation_id' => $v->id,
                    'name' => $v->name,
                    'attribute_values' => $v->attribute_values,
                    'purchase_price_minor' => $v->purchase_price_minor,
                    'stock' => $v->stock,
                ]),
            ],
        ]);
    }

    public function applyPriceByAttribute(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);
        $data = $request->validate([
            'rows' => ['required', 'array'],
            'rows.*.variation_id' => ['nullable', 'integer'],
            'rows.*.term' => ['nullable', 'string'],
            'rows.*.purchase_price_minor' => ['required', 'integer', 'min:0'],
            'rows.*.stock' => ['nullable', 'integer', 'min:0'],
            'offset' => ['nullable', 'integer', 'min:0'],
        ]);

        $calc = PricingCalculator::forTenant($product->tenant_id);
        $updated = 0;
        foreach ($data['rows'] as $row) {
            $variant = null;
            if (! empty($row['variation_id'])) {
                $variant = ProductVariant::query()
                    ->where('product_id', $product->id)
                    ->where('id', $row['variation_id'])
                    ->first();
            }
            if (! $variant) {
                continue;
            }
            $purchase = (int) $row['purchase_price_minor'];
            $variant->update([
                'purchase_price_minor' => $purchase,
                'stock' => $row['stock'] ?? $variant->stock,
                'price_minor' => (int) round($calc->calculate((float) $purchase, 'retail')),
            ]);
            $updated++;
        }

        return response()->json([
            'data' => [
                'updated' => $updated,
                'offset' => ($data['offset'] ?? 0) + count($data['rows']),
                'remaining' => 0,
            ],
        ]);
    }

    public function originsIndex(Request $request): \Illuminate\Http\JsonResponse
    {
        $items = CoffeeOrigin::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function originsStore(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'iso_code' => ['nullable', 'string', 'max:8'],
            'image_url' => ['nullable', 'string', 'max:2048'],
        ]);
        $tid = $request->user()->tenant_id;
        $origin = CoffeeOrigin::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $data['slug'] ?? Str::slug($data['name']),
            'iso_code' => $data['iso_code'] ?? null,
            'image_url' => $data['image_url'] ?? null,
        ]);

        return response()->json(['data' => $origin], 201);
    }

    public function originsUpdate(Request $request, CoffeeOrigin $origin): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $origin->tenant_id, 403);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
            'iso_code' => ['sometimes', 'nullable', 'string', 'max:8'],
            'image_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ]);
        $origin->update($data);

        return response()->json(['data' => $origin->fresh()]);
    }

    public function originsDestroy(Request $request, CoffeeOrigin $origin): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $origin->tenant_id, 403);
        $origin->delete();

        return response()->json([], 204);
    }

    /** @return array<string, mixed> */
    protected function getSetting(int $tenantId, string $kind): array
    {
        $row = CoffeeSetting::query()->where('tenant_id', $tenantId)->where('kind', $kind)->first();

        return $row?->payload ?? $this->defaultPayload($kind);
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    protected function putSetting(int $tenantId, string $kind, array $payload): array
    {
        $row = CoffeeSetting::query()->updateOrCreate(
            ['tenant_id' => $tenantId, 'kind' => $kind],
            ['payload' => $payload]
        );

        return $row->payload ?? [];
    }

    /** @return array<string, mixed> */
    protected function defaultPayload(string $kind): array
    {
        return match ($kind) {
            'profile' => [
                'scale_min' => 1,
                'scale_max' => 5,
                'acidity_levels' => [
                    ['id' => 'low', 'label' => 'کم'],
                    ['id' => 'medium', 'label' => 'متوسط'],
                    ['id' => 'high', 'label' => 'زیاد'],
                ],
            ],
            'pricing' => ['beans' => [], 'base_mixes' => [], 'weight_packs' => []],
            'blend' => ['enabled' => true],
            default => [],
        };
    }
}
