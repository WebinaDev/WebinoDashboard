<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CategoryController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = Category::query()->where('tenant_id', $tid)->orderBy('name')->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
        ]);

        $tid = $request->user()->tenant_id;
        $slug = $data['slug'] ?? Str::slug($data['name']);

        $cat = Category::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $slug,
        ]);

        return response()->json(['data' => $cat], 201);
    }

    public function update(Request $request, Category $category): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $category->tenant_id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
        ]);

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
