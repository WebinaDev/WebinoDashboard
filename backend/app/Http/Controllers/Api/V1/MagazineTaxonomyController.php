<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MagazineArticle;
use App\Models\MagazineCategory;
use App\Models\MagazineTag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MagazineTaxonomyController extends Controller
{
    public function categories(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rowsQuery = MagazineCategory::query()->where('tenant_id', $tid);
        \App\Support\StatusTrash::apply($rowsQuery, $request->filled('status') ? (string) $request->query('status') : null);
        $rows = $rowsQuery->orderBy('name')->get();
        $counts = MagazineArticle::query()
            ->where('tenant_id', $tid)
            ->join('magazine_article_category', 'magazine_articles.id', '=', 'magazine_article_category.magazine_article_id')
            ->selectRaw('magazine_category_id, count(*) as c')
            ->groupBy('magazine_category_id')
            ->pluck('c', 'magazine_category_id');

        $items = $rows->map(fn (MagazineCategory $c) => [
            'id' => $c->id,
            'name' => $c->name,
            'slug' => $c->slug,
            'parent' => $c->parent_id,
            'description' => $c->description,
            'count' => (int) ($counts[$c->id] ?? 0),
            'seo' => $c->seo ?? [],
        ])->all();

        $withPosts = collect($items)->where('count', '>', 0)->count();

        return response()->json([
            'data' => [
                'items' => $items,
                'stats' => [
                    'total' => count($items),
                    'with_posts' => $withPosts,
                    'empty' => count($items) - $withPosts,
                ],
            ],
        ]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => 'required|string|max:190',
            'slug' => 'nullable|string|max:190',
            'parent' => 'nullable|integer',
            'description' => 'nullable|string',
            'seo' => 'nullable|array',
        ]);
        $row = MagazineCategory::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $data['slug'] ?? Str::slug($data['name']) ?: 'cat-'.Str::random(4),
            'parent_id' => $data['parent'] ?? null,
            'description' => $data['description'] ?? null,
            'seo' => $data['seo'] ?? null,
        ]);

        return response()->json(['data' => ['id' => $row->id]], 201);
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MagazineCategory::query()->where('tenant_id', $tid)->findOrFail($id);
        $data = $request->validate([
            'name' => 'sometimes|string|max:190',
            'slug' => 'nullable|string|max:190',
            'parent' => 'nullable|integer',
            'description' => 'nullable|string',
            'seo' => 'nullable|array',
        ]);
        if (isset($data['name'])) {
            $row->name = $data['name'];
        }
        if (! empty($data['slug'])) {
            $row->slug = $data['slug'];
        }
        if (array_key_exists('parent', $data)) {
            $row->parent_id = $data['parent'];
        }
        if (array_key_exists('description', $data)) {
            $row->description = $data['description'];
        }
        if (array_key_exists('seo', $data)) {
            $row->seo = $data['seo'];
        }
        $row->save();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function destroyCategory(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MagazineCategory::query()->where('tenant_id', $tid)->findOrFail($id);
        return response()->json(['data' => \App\Support\StatusTrash::trashTree($row, 'parent_id', $request->boolean('force'), 'status', 'publish', ['publish'])]);
    }

    public function restoreCategory(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MagazineCategory::query()->where('tenant_id', $tid)->findOrFail($id);
        $status = \App\Support\StatusTrash::restore($row, 'status', 'publish', ['publish']);

        return response()->json(['data' => ['id' => $row->id, 'status' => $status]]);
    }

    public function tags(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = MagazineTag::query()->where('tenant_id', $tid)->orderBy('name')->limit(1000)->get()
            ->map(fn (MagazineTag $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'slug' => $t->slug,
                'count' => $t->articles()->count(),
            ])->all();

        return response()->json(['data' => ['items' => $items]]);
    }
}
