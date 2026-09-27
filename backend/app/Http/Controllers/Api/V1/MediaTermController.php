<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use App\Models\MediaTerm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class MediaTermController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $terms = MediaTerm::query()->where('tenant_id', $tid)->orderBy('name')->get();
        $counts = DB::table('media_asset_term')
            ->join('media_terms', 'media_terms.id', '=', 'media_asset_term.media_term_id')
            ->where('media_terms.tenant_id', $tid)
            ->selectRaw('media_term_id, count(*) as c')
            ->groupBy('media_term_id')
            ->pluck('c', 'media_term_id');
        $folderCounts = MediaAsset::query()
            ->where('tenant_id', $tid)
            ->whereNotNull('folder_term_id')
            ->selectRaw('folder_term_id, count(*) as c')
            ->groupBy('folder_term_id')
            ->pluck('c', 'folder_term_id');

        $map = fn (MediaTerm $t) => [
            'id' => $t->id,
            'kind' => $t->kind,
            'name' => $t->name,
            'slug' => $t->slug,
            'parent' => $t->parent_id,
            'description' => $t->description,
            'count' => $t->kind === 'folder'
                ? (int) ($folderCounts[$t->id] ?? 0)
                : (int) ($counts[$t->id] ?? 0),
        ];

        return response()->json([
            'data' => [
                'folders' => $terms->where('kind', 'folder')->values()->map($map)->all(),
                'categories' => $terms->where('kind', 'category')->values()->map($map)->all(),
                'tags' => $terms->where('kind', 'tag')->values()->map($map)->all(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'kind' => ['required', Rule::in(['folder', 'category', 'tag'])],
            'name' => 'required|string|max:190',
            'slug' => 'nullable|string|max:190',
            'parent' => 'nullable|integer',
            'description' => 'nullable|string',
        ]);
        $slug = $data['slug'] ?? Str::slug($data['name']);
        if ($slug === '') {
            $slug = 'term-'.Str::random(6);
        }
        $parent = $data['kind'] === 'tag' ? null : ($data['parent'] ?? null);
        if ($parent) {
            MediaTerm::query()->where('tenant_id', $tid)->where('kind', $data['kind'])->findOrFail($parent);
        }
        $row = MediaTerm::query()->create([
            'tenant_id' => $tid,
            'kind' => $data['kind'],
            'name' => $data['name'],
            'slug' => $slug,
            'parent_id' => $parent,
            'description' => $data['description'] ?? null,
        ]);

        return response()->json(['data' => $this->serialize($row, 0)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MediaTerm::query()->where('tenant_id', $tid)->findOrFail($id);
        $data = $request->validate([
            'name' => 'sometimes|string|max:190',
            'slug' => 'nullable|string|max:190',
            'parent' => 'nullable|integer',
            'description' => 'nullable|string',
        ]);
        if (isset($data['name'])) {
            $row->name = $data['name'];
        }
        if (array_key_exists('slug', $data) && $data['slug']) {
            $row->slug = $data['slug'];
        }
        if (array_key_exists('description', $data)) {
            $row->description = $data['description'];
        }
        if ($row->kind !== 'tag' && array_key_exists('parent', $data)) {
            $row->parent_id = $data['parent'];
        }
        $row->save();

        return response()->json(['data' => $this->serialize($row, 0)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MediaTerm::query()->where('tenant_id', $tid)->findOrFail($id);
        MediaTerm::query()->where('tenant_id', $tid)->where('parent_id', $row->id)->update(['parent_id' => null]);
        if ($row->kind === 'folder') {
            MediaAsset::query()->where('tenant_id', $tid)->where('folder_term_id', $row->id)
                ->update(['folder_term_id' => null, 'folder' => null]);
        }
        $row->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    /** @return array<string, mixed> */
    private function serialize(MediaTerm $t, int $count): array
    {
        return [
            'id' => $t->id,
            'kind' => $t->kind,
            'name' => $t->name,
            'slug' => $t->slug,
            'parent' => $t->parent_id,
            'description' => $t->description,
            'count' => $count,
        ];
    }
}
