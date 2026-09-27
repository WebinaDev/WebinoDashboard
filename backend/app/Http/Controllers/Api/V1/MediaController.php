<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use App\Models\MediaTerm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MediaController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $query = MediaAsset::query()
            ->where('tenant_id', $tid)
            ->with(['folderTerm', 'terms'])
            ->orderByDesc('id');

        if ($request->filled('folder_id')) {
            $query->where('folder_term_id', (int) $request->query('folder_id'));
        } elseif ($request->filled('folder')) {
            $query->where('folder', $request->string('folder'));
        }

        if ($request->filled('category_id')) {
            $cid = (int) $request->query('category_id');
            $query->whereHas('terms', fn ($t) => $t->where('media_terms.id', $cid)->where('kind', 'category'));
        }

        if ($mime = trim((string) $request->query('mime', ''))) {
            $query->where('mime', 'like', str_replace(['%', '_'], ['\\%', '\\_'], $mime).'/%');
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $like = '%'.$search.'%';
            $query->where(function ($w) use ($like) {
                $w->where('original_name', 'like', $like)
                    ->orWhere('title', 'like', $like)
                    ->orWhere('alt', 'like', $like);
            });
        }

        $perPage = min(100, max(1, (int) $request->query('per_page', 24)));
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => [
                'items' => collect($paginator->items())->map(fn (MediaAsset $a) => $this->serialize($a))->all(),
                'page' => $paginator->currentPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file' => 'required|file|max:20480',
            'folder' => 'nullable|string|max:120',
            'folder_id' => 'nullable|integer',
            'category_ids' => 'nullable',
            'tag_ids' => 'nullable',
            'alt' => 'nullable|string|max:255',
            'title' => 'nullable|string|max:255',
        ]);

        $tid = (int) $request->user()->tenant_id;
        $file = $data['file'];
        $folderId = isset($data['folder_id']) ? (int) $data['folder_id'] : null;
        $folderSlug = $data['folder'] ?? null;

        if ($folderId) {
            $term = MediaTerm::query()->where('tenant_id', $tid)->where('kind', 'folder')->find($folderId);
            abort_if(! $term, 422);
            $folderSlug = $term->slug;
        }

        $dir = 'media/'.$tid.($folderSlug ? '/'.trim($folderSlug, '/') : '');
        $storedPath = $file->store($dir, 'public');
        $name = $file->getClientOriginalName();

        $row = MediaAsset::query()->create([
            'tenant_id' => $tid,
            'folder' => $folderSlug,
            'folder_term_id' => $folderId,
            'path' => $storedPath,
            'disk' => 'public',
            'mime' => $file->getMimeType(),
            'size' => $file->getSize() ?: 0,
            'alt' => $data['alt'] ?? null,
            'original_name' => $name,
            'title' => $data['title'] ?? pathinfo($name, PATHINFO_FILENAME),
            'slug' => Str::slug(pathinfo($name, PATHINFO_FILENAME)) ?: 'file-'.Str::random(6),
        ]);

        $this->syncTerms($row, $tid, $this->parseIdList($data['category_ids'] ?? null), $this->parseIdList($data['tag_ids'] ?? null));

        return response()->json(['data' => $this->serialize($row->fresh(['folderTerm', 'terms']))], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MediaAsset::query()->where('tenant_id', $tid)->findOrFail($id);
        $data = $request->validate([
            'title' => 'sometimes|nullable|string|max:255',
            'slug' => 'sometimes|nullable|string|max:120',
            'caption' => 'sometimes|nullable|string',
            'description' => 'sometimes|nullable|string',
            'alt' => 'sometimes|nullable|string|max:255',
            'folder_id' => 'sometimes|nullable|integer',
            'category_ids' => 'sometimes|nullable|array',
            'category_ids.*' => 'integer',
            'tag_ids' => 'sometimes|nullable|array',
            'tag_ids.*' => 'integer',
        ]);

        if (array_key_exists('folder_id', $data)) {
            $folderId = $data['folder_id'];
            if ($folderId) {
                $term = MediaTerm::query()->where('tenant_id', $tid)->where('kind', 'folder')->findOrFail($folderId);
                $row->folder_term_id = $term->id;
                $row->folder = $term->slug;
            } else {
                $row->folder_term_id = null;
                $row->folder = null;
            }
        }

        foreach (['title', 'slug', 'caption', 'description', 'alt'] as $field) {
            if (array_key_exists($field, $data)) {
                $row->{$field} = $data[$field];
            }
        }
        $row->save();

        if (array_key_exists('category_ids', $data) || array_key_exists('tag_ids', $data)) {
            $cats = array_key_exists('category_ids', $data)
                ? array_map('intval', $data['category_ids'] ?? [])
                : $row->terms()->where('kind', 'category')->pluck('media_terms.id')->all();
            $tags = array_key_exists('tag_ids', $data)
                ? array_map('intval', $data['tag_ids'] ?? [])
                : $row->terms()->where('kind', 'tag')->pluck('media_terms.id')->all();
            $this->syncTerms($row, (int) $tid, $cats, $tags);
        }

        return response()->json(['data' => $this->serialize($row->fresh(['folderTerm', 'terms']))]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MediaAsset::query()->where('tenant_id', $tid)->findOrFail($id);

        $disk = $row->disk === 'local' ? 'public' : $row->disk;
        if ($row->path && Storage::disk($disk)->exists($row->path)) {
            Storage::disk($disk)->delete($row->path);
        }

        $row->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    /** @param  list<int>  $categoryIds @param  list<int>  $tagIds */
    private function syncTerms(MediaAsset $row, int $tid, array $categoryIds, array $tagIds): void
    {
        $ids = MediaTerm::query()
            ->where('tenant_id', $tid)
            ->where(function ($q) use ($categoryIds, $tagIds) {
                $q->where(function ($w) use ($categoryIds) {
                    $w->where('kind', 'category')->whereIn('id', $categoryIds);
                })->orWhere(function ($w) use ($tagIds) {
                    $w->where('kind', 'tag')->whereIn('id', $tagIds);
                });
            })
            ->pluck('id')
            ->all();
        $row->terms()->sync($ids);
    }

    /** @return list<int> */
    private function parseIdList(mixed $raw): array
    {
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : explode(',', $raw);
        }
        if (! is_array($raw)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map('intval', $raw))));
    }

    /** @return array<string, mixed> */
    private function serialize(MediaAsset $a): array
    {
        $terms = $a->relationLoaded('terms') ? $a->terms : $a->terms()->get();

        return [
            'id' => $a->id,
            'url' => $a->url,
            'path' => $a->path,
            'mime' => $a->mime,
            'size' => $a->size,
            'alt' => $a->alt,
            'original_name' => $a->original_name,
            'title' => $a->title,
            'slug' => $a->slug,
            'caption' => $a->caption,
            'description' => $a->description,
            'folder' => $a->folder,
            'folder_id' => $a->folder_term_id,
            'folder_term' => $a->folderTerm ? $this->serializeTerm($a->folderTerm) : null,
            'category_ids' => $terms->where('kind', 'category')->pluck('id')->values()->all(),
            'tag_ids' => $terms->where('kind', 'tag')->pluck('id')->values()->all(),
            'categories' => $terms->where('kind', 'category')->map(fn ($t) => $this->serializeTerm($t))->values()->all(),
            'tags' => $terms->where('kind', 'tag')->map(fn ($t) => $this->serializeTerm($t))->values()->all(),
            'created_at' => optional($a->created_at)?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeTerm(MediaTerm $t): array
    {
        return [
            'id' => $t->id,
            'kind' => $t->kind,
            'name' => $t->name,
            'slug' => $t->slug,
            'parent' => $t->parent_id,
            'description' => $t->description,
        ];
    }
}
