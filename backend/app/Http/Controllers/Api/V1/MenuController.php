<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Menu;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class MenuController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = Menu::query()
            ->where('tenant_id', $tid)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'menu_type' => ['nullable', 'string', 'max:32'],
            'locale' => ['nullable', 'string', 'max:8'],
            'schedule' => ['nullable', 'array'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $slug = $data['slug'] ?? Str::slug($data['name']);
        $slug = $this->uniqueSlug($tid, $slug);

        $menu = Menu::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $slug,
            'menu_type' => $data['menu_type'] ?? 'cafe',
            'locale' => $data['locale'] ?? null,
            'schedule' => $data['schedule'] ?? null,
            'is_active' => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        return response()->json(['data' => $menu], 201);
    }

    public function update(Request $request, Menu $menu): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $menu->tenant_id, 403);

        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
            'menu_type' => ['sometimes', 'string', 'max:32'],
            'locale' => ['sometimes', 'nullable', 'string', 'max:8'],
            'schedule' => ['sometimes', 'nullable', 'array'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        if (isset($data['slug'])) {
            $data['slug'] = $this->uniqueSlug($tid, $data['slug'], $menu->id);
        }

        $menu->update($data);

        return response()->json(['data' => $menu->fresh()]);
    }

    public function destroy(Request $request, Menu $menu): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $menu->tenant_id, 403);
        $menu->delete();

        return response()->json([], 204);
    }

    private function uniqueSlug(int $tenantId, string $slug, ?int $exceptId = null): string
    {
        $base = $slug !== '' ? $slug : 'menu';
        $candidate = $base;
        $i = 1;

        while (
            Menu::query()
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
