<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CmsPage;
use App\Models\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CmsController extends Controller
{
    public function pages(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = CmsPage::query()
            ->where('tenant_id', $tid)
            ->orderBy('slug')
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:120',
            'body' => 'nullable|string',
            'published' => 'boolean',
        ]);
        $tid = $request->user()->tenant_id;
        $row = CmsPage::query()->create([
            'tenant_id' => $tid,
            'slug' => $data['slug'] ?? Str::slug($data['title']),
            ...$data,
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $page): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = CmsPage::query()->where('tenant_id', $tid)->findOrFail($page);
        $data = $request->validate([
            'title' => 'sometimes|string|max:255',
            'slug' => 'nullable|string|max:120',
            'body' => 'nullable|string',
            'published' => 'boolean',
        ]);
        $row->update($data);

        return response()->json(['data' => $row]);
    }

    public function destroy(Request $request, int $page): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        CmsPage::query()->where('tenant_id', $tid)->where('id', $page)->delete();

        return response()->json(null, 204);
    }

    public function homeBlocks(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);

        return response()->json(['data' => $tenant->home_blocks ?? []]);
    }

    public function updateHomeBlocks(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'blocks' => 'required|array',
        ]);
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);
        $tenant->update(['home_blocks' => $data['blocks']]);

        return response()->json(['data' => $tenant->home_blocks]);
    }
}
