<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MenuBanner;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MenuBannerController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = MenuBanner::query()
            ->where('tenant_id', $tid)
            ->orderBy('sort_order')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;

        $count = MenuBanner::query()->where('tenant_id', $tid)->count();
        abort_if($count >= 3, 422, __('api.banner_limit'));

        $data = $request->validate([
            'menu_id' => ['nullable', 'integer', Rule::exists('menus', 'id')->where('tenant_id', $tid)],
            'title_fa' => ['nullable', 'string', 'max:255'],
            'title_en' => ['nullable', 'string', 'max:255'],
            'image_url' => ['required', 'string', 'max:2048'],
            'link_url' => ['nullable', 'string', 'max:2048'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:2'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $banner = MenuBanner::query()->create([
            'tenant_id' => $tid,
            ...$data,
            'sort_order' => $data['sort_order'] ?? $count,
            'is_active' => $data['is_active'] ?? true,
        ]);

        return response()->json(['data' => $banner], 201);
    }

    public function update(Request $request, MenuBanner $banner): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $banner->tenant_id, 403);

        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'menu_id' => ['sometimes', 'nullable', 'integer', Rule::exists('menus', 'id')->where('tenant_id', $tid)],
            'title_fa' => ['sometimes', 'nullable', 'string', 'max:255'],
            'title_en' => ['sometimes', 'nullable', 'string', 'max:255'],
            'image_url' => ['sometimes', 'string', 'max:2048'],
            'link_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:2'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $banner->update($data);

        return response()->json(['data' => $banner->fresh()]);
    }

    public function destroy(Request $request, MenuBanner $banner): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $banner->tenant_id, 403);
        $banner->delete();

        return response()->json([], 204);
    }
}
