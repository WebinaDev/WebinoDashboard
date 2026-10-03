<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BlogCategory;
use App\Models\BlogPost;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BlogCategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rowsQuery = BlogCategory::query()->where('tenant_id', $tid);
        \App\Support\StatusTrash::apply($rowsQuery, $request->filled('status') ? (string) $request->query('status') : null);
        $rows = $rowsQuery->orderBy('name')->get();
        $counts = BlogPost::query()
            ->where('tenant_id', $tid)
            ->whereNotNull('category_id')
            ->selectRaw('category_id, count(*) as c')
            ->groupBy('category_id')
            ->pluck('c', 'category_id');

        $items = $rows->map(fn (BlogCategory $c) => [
            'id' => $c->id,
            'name' => $c->name,
            'slug' => $c->slug,
            'count' => (int) ($counts[$c->id] ?? 0),
            'seo' => $c->seo ?? [],
            'status' => $c->status ?: 'publish',
        ])->all();

        return response()->json([
            'data' => [
                'items' => $items,
                'stats' => [
                    'total' => count($items),
                    'with_posts' => collect($items)->where('count', '>', 0)->count(),
                ],
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => 'required|string|max:190',
            'slug' => 'nullable|string|max:190',
            'seo' => 'nullable|array',
        ]);
        $row = BlogCategory::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $data['slug'] ?? Str::slug($data['name']) ?: 'cat-'.Str::random(4),
            'seo' => $data['seo'] ?? null,
        ]);

        return response()->json(['data' => ['id' => $row->id, 'name' => $row->name, 'slug' => $row->slug]], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = BlogCategory::query()->where('tenant_id', $tid)->findOrFail($id);
        $data = $request->validate([
            'name' => 'sometimes|string|max:190',
            'slug' => 'nullable|string|max:190',
            'seo' => 'nullable|array',
        ]);
        $row->update($data);

        return response()->json(['data' => ['id' => $row->id, 'name' => $row->name, 'slug' => $row->slug]]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = BlogCategory::query()->where('tenant_id', $tid)->findOrFail($id);

        return response()->json(['data' => \App\Support\StatusTrash::trashOrDelete($row, $request->boolean('force'), 'status', 'publish', ['publish'])]);
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = BlogCategory::query()->where('tenant_id', $tid)->findOrFail($id);
        $status = \App\Support\StatusTrash::restore($row, 'status', 'publish', ['publish']);

        return response()->json(['data' => ['id' => $row->id, 'status' => $status]]);
    }
}
