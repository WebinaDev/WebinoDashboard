<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BrandController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = Brand::query()->where('tenant_id', $tid)->withCount('products');

        if ($search = $request->query('search')) {
            $like = '%'.$search.'%';
            $q->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)
                    ->orWhere('slug', 'like', $like);
            });
        }

        if ($request->query('parent') === 'root') {
            $q->whereNull('parent_id');
        } elseif ($request->filled('parent_id')) {
            $q->where('parent_id', (int) $request->query('parent_id'));
        }

        $items = $q->orderBy('name')->get();

        return response()->json(['data' => $items]);
    }

    public function show(Request $request, Brand $brand): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $brand->tenant_id);

        return response()->json(['data' => $brand->loadCount('products')]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'thumbnail_id' => ['nullable', 'integer'],
            'parent_id' => ['nullable', 'integer', Rule::exists('brands', 'id')->where('tenant_id', $tid)],
        ]);

        $slug = $this->ensureUniqueSlug($tid, $data['slug'] ?? Str::slug($data['name']));

        $brand = Brand::query()->create([
            'tenant_id' => $tid,
            'parent_id' => $data['parent_id'] ?? null,
            'name' => $data['name'],
            'slug' => $slug,
            'description' => $data['description'] ?? null,
            'image_url' => $data['image_url'] ?? null,
            'thumbnail_id' => $data['thumbnail_id'] ?? null,
        ]);

        return response()->json(['data' => $brand], 201);
    }

    public function update(Request $request, Brand $brand): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $brand->tenant_id);
        $tid = $brand->tenant_id;

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'image_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'thumbnail_id' => ['sometimes', 'nullable', 'integer'],
            'parent_id' => ['sometimes', 'nullable', 'integer', Rule::exists('brands', 'id')->where('tenant_id', $tid)],
        ]);

        if (isset($data['slug'])) {
            $data['slug'] = $this->ensureUniqueSlug($tid, $data['slug'], $brand->id);
        }
        if (array_key_exists('parent_id', $data) && (int) $data['parent_id'] === $brand->id) {
            unset($data['parent_id']);
        }

        $brand->update($data);

        return response()->json(['data' => $brand->fresh()->loadCount('products')]);
    }

    public function destroy(Request $request, Brand $brand): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $brand->tenant_id);
        $brand->delete();

        return response()->json([], 204);
    }

    protected function authorizeTenant(Request $request, int $tenantId): void
    {
        abort_if($request->user()->tenant_id !== $tenantId, 403);
    }

    private function ensureUniqueSlug(int $tenantId, string $slug, ?int $exceptId = null): string
    {
        $base = $slug !== '' ? $slug : 'brand';
        $candidate = $base;
        $i = 1;
        while (
            Brand::query()
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
