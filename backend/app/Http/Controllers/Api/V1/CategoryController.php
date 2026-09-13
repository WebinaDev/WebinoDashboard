<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = Category::query()
            ->where('tenant_id', $tid)
            ->withCount(['products', 'productsMany']);

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

        $items = $q->orderBy('sort_order')->orderBy('name')->get();

        return response()->json(['data' => $items]);
    }

    public function show(Request $request, Category $category): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $category->tenant_id);

        return response()->json(['data' => $category->loadCount(['products', 'productsMany'])]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'icon_url' => ['nullable', 'string', 'max:2048'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'display_mode' => ['nullable', 'string', 'in:grid,list,cover'],
            'cover_image_url' => ['nullable', 'string', 'max:2048'],
            'thumbnail_id' => ['nullable', 'integer'],
            'parent_id' => ['nullable', 'integer', Rule::exists('categories', 'id')->where('tenant_id', $tid)],
        ]);

        $slug = $data['slug'] ?? Str::slug($data['name']);

        $cat = Category::query()->create([
            'tenant_id' => $tid,
            'parent_id' => $data['parent_id'] ?? null,
            'name' => $data['name'],
            'slug' => $slug,
            'description' => $data['description'] ?? null,
            'icon_url' => $data['icon_url'] ?? null,
            'image_url' => $data['image_url'] ?? null,
            'sort_order' => $data['sort_order'] ?? 0,
            'display_mode' => $data['display_mode'] ?? 'grid',
            'cover_image_url' => $data['cover_image_url'] ?? null,
            'thumbnail_id' => $data['thumbnail_id'] ?? null,
        ]);

        return response()->json(['data' => $cat], 201);
    }

    public function update(Request $request, Category $category): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $category->tenant_id);
        $tid = $category->tenant_id;

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'icon_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'image_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'display_mode' => ['sometimes', 'string', 'in:grid,list,cover'],
            'cover_image_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'thumbnail_id' => ['sometimes', 'nullable', 'integer'],
            'parent_id' => ['sometimes', 'nullable', 'integer', Rule::exists('categories', 'id')->where('tenant_id', $tid)],
        ]);

        if (array_key_exists('parent_id', $data) && (int) $data['parent_id'] === $category->id) {
            unset($data['parent_id']);
        }

        $category->update($data);

        return response()->json(['data' => $category->fresh()]);
    }

    public function destroy(Request $request, Category $category): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $category->tenant_id);
        $category->delete();

        return response()->json([], 204);
    }

    protected function authorizeTenant(Request $request, int $tenantId): void
    {
        abort_if($request->user()->tenant_id !== $tenantId, 403);
    }
}
