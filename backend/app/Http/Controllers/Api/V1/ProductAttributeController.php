<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AttributeGroup;
use App\Models\ProductAttribute;
use App\Models\ProductAttributeTerm;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProductAttributeController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = ProductAttribute::query()
            ->where('tenant_id', $tid)
            ->withCount('terms')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function show(Request $request, ProductAttribute $attribute): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $attribute->tenant_id);

        return response()->json(['data' => $attribute->load(['terms'])->loadCount('terms')]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'type' => ['nullable', 'string', 'in:select,color,image,button,text'],
            'order_by' => ['nullable', 'string', 'in:menu_order,name,name_num,id'],
            'has_archives' => ['nullable', 'boolean'],
            'show_swatch_label' => ['nullable', 'boolean'],
        ]);

        $slug = $this->ensureUniqueSlug($tid, $data['slug'] ?? Str::slug($data['name']));

        $attr = ProductAttribute::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $slug,
            'type' => $data['type'] ?? 'select',
            'order_by' => $data['order_by'] ?? 'menu_order',
            'has_archives' => $data['has_archives'] ?? false,
            'show_swatch_label' => $data['show_swatch_label'] ?? true,
        ]);

        return response()->json(['data' => $attr], 201);
    }

    public function update(Request $request, ProductAttribute $attribute): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $attribute->tenant_id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
            'type' => ['sometimes', 'string', 'in:select,color,image,button,text'],
            'order_by' => ['sometimes', 'string', 'in:menu_order,name,name_num,id'],
            'has_archives' => ['sometimes', 'boolean'],
            'show_swatch_label' => ['sometimes', 'boolean'],
        ]);

        if (isset($data['slug'])) {
            $data['slug'] = $this->ensureUniqueSlug($attribute->tenant_id, $data['slug'], $attribute->id);
        }

        $attribute->update($data);

        return response()->json(['data' => $attribute->fresh()->load('terms')]);
    }

    public function destroy(Request $request, ProductAttribute $attribute): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $attribute->tenant_id);
        $attribute->delete();

        return response()->json([], 204);
    }

    public function termsIndex(Request $request, ProductAttribute $attribute): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $attribute->tenant_id);

        return response()->json(['data' => $attribute->terms()->get()]);
    }

    public function termsStore(Request $request, ProductAttribute $attribute): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $attribute->tenant_id);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'menu_order' => ['nullable', 'integer', 'min:0'],
            'color' => ['nullable', 'string', 'max:32'],
            'image_url' => ['nullable', 'string', 'max:2048'],
        ]);

        $slug = $data['slug'] ?? Str::slug($data['name']);
        $term = ProductAttributeTerm::query()->create([
            'tenant_id' => $attribute->tenant_id,
            'product_attribute_id' => $attribute->id,
            'name' => $data['name'],
            'slug' => $slug,
            'description' => $data['description'] ?? null,
            'menu_order' => $data['menu_order'] ?? 0,
            'color' => $data['color'] ?? null,
            'image_url' => $data['image_url'] ?? null,
        ]);

        return response()->json(['data' => $term], 201);
    }

    public function termsUpdate(Request $request, ProductAttributeTerm $term): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $term->tenant_id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'menu_order' => ['sometimes', 'integer', 'min:0'],
            'color' => ['sometimes', 'nullable', 'string', 'max:32'],
            'image_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ]);
        $term->update($data);

        return response()->json(['data' => $term->fresh()]);
    }

    public function termsDestroy(Request $request, ProductAttributeTerm $term): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $term->tenant_id);
        $term->delete();

        return response()->json([], 204);
    }

    public function groupsIndex(Request $request): \Illuminate\Http\JsonResponse
    {
        $items = AttributeGroup::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function groupsStore(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'attribute_ids' => ['nullable', 'array'],
            'attribute_ids.*' => ['integer'],
        ]);

        $group = AttributeGroup::query()->create([
            'tenant_id' => $request->user()->tenant_id,
            'name' => $data['name'],
            'attribute_ids' => $data['attribute_ids'] ?? [],
        ]);

        return response()->json(['data' => $group], 201);
    }

    public function groupsUpdate(Request $request, AttributeGroup $group): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $group->tenant_id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'attribute_ids' => ['sometimes', 'nullable', 'array'],
            'attribute_ids.*' => ['integer'],
        ]);
        $group->update($data);

        return response()->json(['data' => $group->fresh()]);
    }

    public function groupsDestroy(Request $request, AttributeGroup $group): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $group->tenant_id);
        $group->delete();

        return response()->json([], 204);
    }

    protected function authorizeTenant(Request $request, int $tenantId): void
    {
        abort_if($request->user()->tenant_id !== $tenantId, 403);
    }

    private function ensureUniqueSlug(int $tenantId, string $slug, ?int $exceptId = null): string
    {
        $base = $slug !== '' ? $slug : 'attr';
        $candidate = $base;
        $i = 1;
        while (
            ProductAttribute::query()
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
