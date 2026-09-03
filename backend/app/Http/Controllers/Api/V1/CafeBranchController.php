<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CafeBranch;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CafeBranchController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = CafeBranch::query()
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
            'address_fa' => ['nullable', 'string', 'max:500'],
            'address_en' => ['nullable', 'string', 'max:500'],
            'phone' => ['nullable', 'string', 'max:32'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $slug = $data['slug'] ?? Str::slug($data['name_en']);

        $branch = CafeBranch::query()->create([
            'tenant_id' => $tid,
            'slug' => $slug,
            'name_fa' => $data['name_fa'],
            'name_en' => $data['name_en'],
            'address_fa' => $data['address_fa'] ?? null,
            'address_en' => $data['address_en'] ?? null,
            'phone' => $data['phone'] ?? null,
            'is_active' => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        return response()->json(['data' => $branch], 201);
    }

    public function update(Request $request, CafeBranch $branch): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $branch->tenant_id, 403);

        $data = $request->validate([
            'name_fa' => ['sometimes', 'string', 'max:255'],
            'name_en' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
            'address_fa' => ['sometimes', 'nullable', 'string', 'max:500'],
            'address_en' => ['sometimes', 'nullable', 'string', 'max:500'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        $branch->update($data);

        return response()->json(['data' => $branch->fresh()]);
    }

    public function destroy(Request $request, CafeBranch $branch): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $branch->tenant_id, 403);
        $branch->delete();

        return response()->json([], 204);
    }
}
