<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductModifier;
use App\Models\ProductModifierOption;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductModifierController extends Controller
{
    public function index(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);

        $modifiers = ProductModifier::query()
            ->where('product_id', $product->id)
            ->with('options')
            ->orderBy('sort_order')
            ->get();

        return response()->json(['data' => $modifiers]);
    }

    public function store(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);

        $data = $request->validate([
            'name_fa' => ['required', 'string', 'max:255'],
            'name_en' => ['required', 'string', 'max:255'],
            'min_select' => ['nullable', 'integer', 'min:0'],
            'max_select' => ['nullable', 'integer', 'min:1'],
            'is_required' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'options' => ['nullable', 'array'],
            'options.*.name_fa' => ['required_with:options', 'string', 'max:255'],
            'options.*.name_en' => ['required_with:options', 'string', 'max:255'],
            'options.*.price_minor' => ['nullable', 'integer', 'min:0'],
            'options.*.is_default' => ['nullable', 'boolean'],
            'options.*.is_addon' => ['nullable', 'boolean'],
            'options.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $modifier = ProductModifier::query()->create([
            'tenant_id' => $product->tenant_id,
            'product_id' => $product->id,
            'name_fa' => $data['name_fa'],
            'name_en' => $data['name_en'],
            'min_select' => $data['min_select'] ?? 0,
            'max_select' => $data['max_select'] ?? 1,
            'is_required' => $data['is_required'] ?? false,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        foreach ($data['options'] ?? [] as $idx => $opt) {
            ProductModifierOption::query()->create([
                'modifier_id' => $modifier->id,
                'name_fa' => $opt['name_fa'],
                'name_en' => $opt['name_en'],
                'price_minor' => $opt['price_minor'] ?? 0,
                'is_default' => $opt['is_default'] ?? false,
                'is_addon' => $opt['is_addon'] ?? false,
                'sort_order' => $opt['sort_order'] ?? $idx,
            ]);
        }

        return response()->json(['data' => $modifier->load('options')], 201);
    }

    public function update(Request $request, ProductModifier $modifier): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $modifier->tenant_id, 403);

        $data = $request->validate([
            'name_fa' => ['sometimes', 'string', 'max:255'],
            'name_en' => ['sometimes', 'string', 'max:255'],
            'min_select' => ['sometimes', 'integer', 'min:0'],
            'max_select' => ['sometimes', 'integer', 'min:1'],
            'is_required' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'options' => ['sometimes', 'array'],
            'options.*.id' => ['required', 'integer'],
            'options.*.name_fa' => ['required', 'string', 'max:255'],
            'options.*.name_en' => ['required', 'string', 'max:255'],
            'options.*.price_minor' => ['nullable', 'integer', 'min:0'],
            'options.*.is_default' => ['nullable', 'boolean'],
            'options.*.is_addon' => ['nullable', 'boolean'],
            'options.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        \Illuminate\Support\Facades\DB::transaction(function () use ($modifier, $data) {
            $rows = $data['options'] ?? null;
            unset($data['options']);
            $modifier->update($data);
            if (! is_array($rows)) {
                return;
            }
            $keep = [];
            foreach ($rows as $idx => $opt) {
                $keep[] = $modifier->options()->updateOrCreate(
                    ['id' => (int) $opt['id']],
                    [
                        'name_fa' => $opt['name_fa'],
                        'name_en' => $opt['name_en'],
                        'price_minor' => $opt['price_minor'] ?? 0,
                        'is_default' => $opt['is_default'] ?? false,
                        // «افزودنی» rows are named extras: offered unselected and free of charge.
                        'is_addon' => $opt['is_addon'] ?? false,
                        'sort_order' => $opt['sort_order'] ?? $idx,
                    ],
                )->id;
            }
            $modifier->options()->whereNotIn('id', $keep)->delete();
        });

        return response()->json(['data' => $modifier->fresh()->load('options')]);
    }

    public function destroy(Request $request, ProductModifier $modifier): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $modifier->tenant_id, 403);
        $modifier->delete();

        return response()->json([], 204);
    }

    public function syncAllergens(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);

        $data = $request->validate([
            'allergen_ids' => ['required', 'array'],
            'allergen_ids.*' => ['integer', Rule::exists('allergens', 'id')->where('tenant_id', $product->tenant_id)],
        ]);

        $product->allergens()->sync($data['allergen_ids']);

        return response()->json(['data' => $product->load('allergens')]);
    }

    public function syncMedia(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);

        $data = $request->validate([
            'media' => ['required', 'array'],
            'media.*.type' => ['required', 'string', 'in:image,video'],
            'media.*.url' => ['required', 'string', 'max:2048'],
            'media.*.sort_order' => ['nullable', 'integer', 'min:0'],
            'media.*.is_cover' => ['nullable', 'boolean'],
        ]);

        $product->media()->delete();

        foreach ($data['media'] as $idx => $row) {
            $product->media()->create([
                'tenant_id' => $product->tenant_id,
                'type' => $row['type'],
                'url' => $row['url'],
                'sort_order' => $row['sort_order'] ?? $idx,
                'is_cover' => $row['is_cover'] ?? false,
            ]);
        }

        return response()->json(['data' => $product->load('media')]);
    }

    /**
     * Replace an item's 3D recordings: glTF models (`model3d`) for the AR/3D viewer and
     * 360° turntable frames (`spin360`). Stored per item so a new scan never touches photos.
     */
    public function syncGalleryViews(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $product->tenant_id, 403);

        $data = $request->validate([
            'views' => ['required', 'array', 'max:4'],
            'views.*.type' => ['required', 'string', 'in:model3d,spin360'],
            'views.*.url' => ['required', 'string', 'max:2048'],
            'views.*.poster_url' => ['nullable', 'string', 'max:2048'],
            'views.*.frames' => ['nullable', 'integer', 'min:0', 'max:72'],
            'views.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        \App\Models\ProductGalleryView::query()->where('product_id', $product->id)->delete();
        foreach ($data['views'] as $idx => $row) {
            \App\Models\ProductGalleryView::query()->create([
                'tenant_id' => $product->tenant_id,
                'product_id' => $product->id,
                'type' => $row['type'],
                'url' => $row['url'],
                'poster_url' => $row['poster_url'] ?? null,
                'frames' => $row['type'] === 'spin360' ? (int) ($row['frames'] ?? 0) : 0,
                'sort_order' => $row['sort_order'] ?? $idx,
            ]);
        }

        return response()->json(['data' => $product->load('galleryViews')]);
    }
}
