<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreMediaRequest;
use App\Models\MediaAsset;
use App\Models\MediaTerm;
use App\Services\Media\MediaAiCleanupService;
use Illuminate\Database\Eloquent\Builder;
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

        $this->applyListFilters($query, $request);

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

    public function aiCleanup(Request $request, MediaAiCleanupService $cleanup): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'ids' => 'sometimes|nullable|array',
            'ids.*' => 'integer',
            'limit' => 'sometimes|integer|min:1|max:200',
            'without_folder' => 'sometimes|boolean',
            'without_category' => 'sometimes|boolean',
            'without_tags' => 'sometimes|boolean',
            'without_caption' => 'sometimes|boolean',
            'without_alt' => 'sometimes|boolean',
            'without_description' => 'sometimes|boolean',
            'bad_slug' => 'sometimes|boolean',
            'folder_id' => 'sometimes|nullable|integer',
            'category_id' => 'sometimes|nullable|integer',
            'search' => 'sometimes|nullable|string|max:190',
        ]);

        $limit = (int) ($data['limit'] ?? 100);
        $query = MediaAsset::query()->where('tenant_id', $tid)->orderByDesc('id');

        $ids = array_values(array_unique(array_filter(array_map('intval', $data['ids'] ?? []))));
        $hasProblemFilter = $request->boolean('without_folder')
            || $request->boolean('without_category')
            || $request->boolean('without_tags')
            || $request->boolean('without_caption')
            || $request->boolean('without_alt')
            || $request->boolean('without_description')
            || $request->boolean('bad_slug');

        if ($ids !== []) {
            $query->whereIn('id', $ids);
        } elseif ($hasProblemFilter || $request->filled('search') || $request->filled('folder_id') || $request->filled('category_id')) {
            $this->applyListFilters($query, $request);
        } else {
            return response()->json([
                'message' => 'Provide ids or at least one problem/list filter.',
            ], 422);
        }

        $rows = $query->limit($limit)->get();
        $results = [];
        $fixed = 0;
        foreach ($rows as $row) {
            $result = $cleanup->fix($row);
            $results[] = $result;
            if ($result['fields'] !== []) {
                $fixed++;
            }
        }

        return response()->json([
            'data' => [
                'fixed' => $fixed,
                'scanned' => count($results),
                'items' => $results,
            ],
        ]);
    }

    public function store(StoreMediaRequest $request): JsonResponse
    {
        $data = $request->validated();

        $tid = (int) $request->user()->tenant_id;
        $file = $request->file('file');
        abort_unless($file !== null, 422);
        $folderId = isset($data['folder_id']) ? (int) $data['folder_id'] : null;
        $folderSlug = $data['folder'] ?? null;

        if ($folderId) {
            $term = MediaTerm::query()->where('tenant_id', $tid)->where('kind', 'folder')->find($folderId);
            abort_if(! $term, 422);
            $folderSlug = $term->slug;
        }

        $dir = 'media/'.$tid.($folderSlug ? '/'.trim($folderSlug, '/') : '');
        $name = $file->getClientOriginalName();
        $mime = $file->getMimeType();
        if (strtolower((string) $file->getClientOriginalExtension()) === 'svg' || str_contains((string) $mime, 'svg')) {
            $clean = app(\App\Services\Media\SvgSanitizer::class)->sanitize((string) file_get_contents($file->getRealPath()));
            abort_if($clean === null, 422, 'Invalid SVG file.');
            $storedPath = $dir.'/'.Str::random(40).'.svg';
            \Illuminate\Support\Facades\Storage::disk('public')->put($storedPath, $clean);
            $mime = 'image/svg+xml';
            $size = strlen($clean);
        } else {
            $storedPath = $file->store($dir, 'public');
        }

        $row = MediaAsset::query()->create([
            'tenant_id' => $tid,
            'folder' => $folderSlug,
            'folder_term_id' => $folderId,
            'path' => $storedPath,
            'disk' => 'public',
            'mime' => $mime,
            'size' => $size ?? ($file->getSize() ?: 0),
            'alt' => $data['alt'] ?? null,
            'original_name' => $name,
            'title' => $data['title'] ?? pathinfo($name, PATHINFO_FILENAME),
            'slug' => Str::slug(pathinfo($name, PATHINFO_FILENAME)) ?: 'file-'.Str::random(6),
        ]);

        // Serve WebP by default (CDN-like); the original upload is kept in original_path.
        if (config('media.webp_on_upload', true)) {
            app(\App\Services\Media\WebpConverter::class)->applyToAsset($row);
        }
        if ($row->path && str_starts_with((string) $row->mime, 'image/')) {
            app(\App\Services\Media\ImageSizes::class)->generate((string) ($row->disk ?: 'public'), $row->path);
        }

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
        foreach (array_filter([$row->path, $row->original_path, $row->path ? \App\Services\Media\ImageSizes::cardPathFor($row->path) : null]) as $p) {
            if (Storage::disk($disk)->exists($p)) {
                Storage::disk($disk)->delete($p);
            }
        }

        $row->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    private function applyListFilters(Builder $query, Request $request): void
    {
        if ($request->filled('folder_id')) {
            $query->where('folder_term_id', (int) $request->input('folder_id'));
        } elseif ($request->filled('folder')) {
            $query->where('folder', $request->string('folder'));
        }

        if ($request->filled('category_id')) {
            $cid = (int) $request->input('category_id');
            $query->whereHas('terms', fn ($t) => $t->where('media_terms.id', $cid)->where('kind', 'category'));
        }

        if ($mime = trim((string) $request->input('mime', ''))) {
            $query->where('mime', 'like', str_replace(['%', '_'], ['\\%', '\\_'], $mime).'/%');
        }

        if ($search = trim((string) $request->input('search', ''))) {
            $like = '%'.$search.'%';
            $query->where(function ($w) use ($like) {
                $w->where('original_name', 'like', $like)
                    ->orWhere('title', 'like', $like)
                    ->orWhere('alt', 'like', $like);
            });
        }

        if ($request->boolean('without_folder')) {
            $query->whereNull('folder_term_id');
        }
        if ($request->boolean('without_category')) {
            $query->whereDoesntHave('terms', fn ($t) => $t->where('kind', 'category'));
        }
        if ($request->boolean('without_tags')) {
            $query->whereDoesntHave('terms', fn ($t) => $t->where('kind', 'tag'));
        }
        if ($request->boolean('without_caption')) {
            $query->where(function ($w) {
                $w->whereNull('caption')->orWhere('caption', '');
            });
        }
        if ($request->boolean('without_alt')) {
            $query->where(function ($w) {
                $w->whereNull('alt')->orWhere('alt', '');
            });
        }
        if ($request->boolean('without_description')) {
            $query->where(function ($w) {
                $w->whereNull('description')->orWhere('description', '');
            });
        }
        if ($request->boolean('bad_slug')) {
            $this->applyBadSlugFilter($query);
        }
    }

    private function applyBadSlugFilter(Builder $query): void
    {
        $driver = $query->getConnection()->getDriverName();
        $query->where(function ($w) use ($driver) {
            $w->whereNull('slug')->orWhere('slug', '')->orWhere('slug', 'like', '% %');
            if ($driver === 'sqlite') {
                $w->orWhereRaw("slug GLOB '*[^a-z0-9-]*'")
                    ->orWhere('slug', 'like', '-%')
                    ->orWhere('slug', 'like', '%-')
                    ->orWhere('slug', 'like', '%--%');
            } else {
                // MySQL / MariaDB: not a clean lowercase latin slug (also catches Persian).
                $w->orWhereRaw("slug NOT REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$'");
            }
        });
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
            'original_url' => $a->original_url,
            'original_mime' => $a->original_mime,
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
