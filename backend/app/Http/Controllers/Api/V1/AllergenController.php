<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Allergen;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AllergenController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = Allergen::query()
            ->where('tenant_id', $tid)
            ->orderBy('sort_order')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name_fa' => ['required', 'string', 'max:255'],
            'name_en' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'icon_url' => ['nullable', 'string', 'max:2048'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $slug = $data['slug'] ?? Str::slug($data['name_en']);

        $allergen = Allergen::query()->create([
            'tenant_id' => $tid,
            'slug' => $slug,
            'name_fa' => $data['name_fa'],
            'name_en' => $data['name_en'],
            'icon_url' => $data['icon_url'] ?? null,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        return response()->json(['data' => $allergen], 201);
    }

    public function update(Request $request, Allergen $allergen): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $allergen->tenant_id, 403);

        $data = $request->validate([
            'name_fa' => ['sometimes', 'string', 'max:255'],
            'name_en' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
            'icon_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        $allergen->update($data);

        return response()->json(['data' => $allergen->fresh()]);
    }

    public function destroy(Request $request, Allergen $allergen): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $allergen->tenant_id, 403);
        $allergen->delete();

        return response()->json([], 204);
    }
}
