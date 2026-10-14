<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\BuilderCollection;
use App\Models\BuilderCollectionItem;
use App\Services\Builder\BuilderAccess;
use App\Services\Builder\CollectionFields;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * CMS Collections: custom content types (fields) with items, listed by the Loop Grid widget.
 * Fields may reference items of other collections; items carry optional SEO overrides.
 */
class BuilderCollectionsController extends Controller
{
    use ResolvesPublicTenant;

    public const FIELD_TYPES = CollectionFields::TYPES;

    private const IMPORT_MAX_ROWS = 2000;

    public function index(Request $request): JsonResponse
    {
        $rows = BuilderCollection::query()->where('tenant_id', $request->user()->tenant_id)->withCount('items')->orderBy('name')->get();

        return response()->json(['data' => $rows->map(fn ($c) => $this->collection($c) + ['items_count' => $c->items_count])->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        BuilderAccess::authorize($request, 'design');
        $data = $this->validateCollection($request);
        $tid = (int) $request->user()->tenant_id;
        $slug = Str::slug($data['slug'] ?? '') ?: Str::slug($data['name']) ?: 'collection-'.Str::lower(Str::random(4));
        abort_if(BuilderCollection::query()->where('tenant_id', $tid)->where('slug', $slug)->exists(), 422, 'slug taken');
        $row = BuilderCollection::query()->create([
            'tenant_id' => $tid, 'slug' => $slug, 'name' => strip_tags($data['name']),
            'fields' => CollectionFields::normalizeFields($data['fields'], $slug), 'seo' => CollectionFields::normalizeCollectionSeo($data['seo'] ?? null),
        ]);

        return response()->json(['data' => $this->collection($row)], 201);
    }

    public function update(Request $request, int $collection): JsonResponse
    {
        BuilderAccess::authorize($request, 'design');
        $row = $this->find($request, $collection);
        $data = $this->validateCollection($request);
        $row->fill([
            'name' => strip_tags($data['name']), 'fields' => CollectionFields::normalizeFields($data['fields'], $row->slug),
            'seo' => array_key_exists('seo', $data) ? CollectionFields::normalizeCollectionSeo($data['seo']) : $row->seo,
        ])->save();

        return response()->json(['data' => $this->collection($row)]);
    }

    public function destroy(Request $request, int $collection): JsonResponse
    {
        BuilderAccess::authorize($request, 'design');
        $this->find($request, $collection)->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    /** Admin list: paginated (`page`, `per_page` ≤ 200) with title search; `meta` carries totals. */
    public function items(Request $request, int $collection): JsonResponse
    {
        $row = $this->find($request, $collection);
        $perPage = max(1, min(200, (int) $request->query('per_page', 100)));
        $page = max(1, (int) $request->query('page', 1));
        $query = $row->items();
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $query->where('title', 'like', '%'.addcslashes(mb_substr($q, 0, 80), '%_\\').'%');
        }
        $total = (clone $query)->count();
        $items = $query->orderBy('sort')->orderByDesc('id')->skip(($page - 1) * $perPage)->take($perPage)->get();

        return response()->json([
            'data' => $items->map(fn ($i) => $this->item($i, true))->values(),
            'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'pages' => (int) max(1, ceil($total / $perPage))],
        ]);
    }

    public function storeItem(Request $request, int $collection): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $row = $this->find($request, $collection);
        $data = $this->validateItem($request);
        $slug = $this->uniqueItemSlug($row, Str::slug($data['slug'] ?? '') ?: Str::slug($data['title']) ?: 'item');
        $item = BuilderCollectionItem::query()->create([
            'tenant_id' => $row->tenant_id, 'collection_id' => $row->id, 'slug' => $slug, 'title' => strip_tags($data['title']),
            'data' => CollectionFields::cleanData($row->fields ?? [], $data['data'] ?? []), 'published' => $data['published'] ?? true, 'sort' => $data['sort'] ?? 0,
            'seo' => CollectionFields::normalizeItemSeo($data['seo'] ?? null),
        ]);

        return response()->json(['data' => $this->item($item, true)], 201);
    }

    public function updateItem(Request $request, int $collection, int $item): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $row = $this->find($request, $collection);
        $model = $row->items()->findOrFail($item);
        $data = $this->validateItem($request);
        $slug = Str::slug($data['slug'] ?? '') ?: $model->slug;
        if ($slug !== $model->slug) {
            $slug = $this->uniqueItemSlug($row, $slug, $model->id);
        }
        $model->fill([
            'slug' => $slug, 'title' => strip_tags($data['title']), 'data' => CollectionFields::cleanData($row->fields ?? [], $data['data'] ?? []),
            'published' => $data['published'] ?? $model->published, 'sort' => $data['sort'] ?? $model->sort,
            'seo' => array_key_exists('seo', $data) ? CollectionFields::normalizeItemSeo($data['seo']) : $model->seo,
        ])->save();

        return response()->json(['data' => $this->item($model, true)]);
    }

    public function destroyItem(Request $request, int $collection, int $item): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $this->find($request, $collection)->items()->findOrFail($item)->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    /** Bulk publish / unpublish / delete for up to 500 selected items. */
    public function bulk(Request $request, int $collection): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $row = $this->find($request, $collection);
        $data = $request->validate(['ids' => 'required|array|min:1|max:500', 'ids.*' => 'integer', 'action' => 'required|in:publish,unpublish,delete']);
        $query = $row->items()->whereIn('id', $data['ids']);
        $count = match ($data['action']) {
            'publish' => $query->update(['published' => true]),
            'unpublish' => $query->update(['published' => false]),
            'delete' => $query->delete(),
        };

        return response()->json(['data' => ['affected' => (int) $count]]);
    }

    /** CSV export (UTF-8 BOM so Excel shows Persian): slug,title,published,sort,<field keys>. */
    public function export(Request $request, int $collection): StreamedResponse
    {
        $row = $this->find($request, $collection);
        $keys = array_column($row->fields ?? [], 'key');

        return response()->streamDownload(function () use ($row, $keys) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, array_merge(['slug', 'title', 'published', 'sort'], $keys));
            $row->items()->orderBy('sort')->orderBy('id')->chunk(500, function ($items) use ($out, $keys) {
                foreach ($items as $item) {
                    $data = $item->data ?? [];
                    fputcsv($out, array_merge([$item->slug, $item->title, $item->published ? '1' : '0', (string) $item->sort], array_map(fn ($k) => CollectionFields::csvSafe((string) ($data[$k] ?? '')), $keys)));
                }
            });
            fclose($out);
        }, $row->slug.'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** CSV import: header row maps columns (slug,title,published,sort,<field keys>); rows upsert by slug. */
    public function import(Request $request, int $collection): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $row = $this->find($request, $collection);
        $request->validate(['file' => 'required|file|max:5120|mimes:csv,txt']);
        $handle = fopen($request->file('file')->getRealPath(), 'r');
        abort_if($handle === false, 422, 'unreadable file');
        $header = fgetcsv($handle);
        abort_if(! is_array($header), 422, 'empty file');
        $header = array_map(fn ($h) => trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h)), $header);
        abort_unless(in_array('title', $header, true), 422, 'title column is required');
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $n = 0;
        DB::transaction(function () use ($handle, $header, $row, &$created, &$updated, &$skipped, &$n) {
            while (($cells = fgetcsv($handle)) !== false) {
                if (++$n > self::IMPORT_MAX_ROWS) {
                    break;
                }
                $rec = [];
                foreach ($header as $i => $key) {
                    $rec[$key] = isset($cells[$i]) ? (string) $cells[$i] : '';
                }
                $title = trim(strip_tags($rec['title'] ?? ''));
                if ($title === '') {
                    $skipped++;

                    continue;
                }
                $slug = Str::slug($rec['slug'] ?? '') ?: Str::slug($title) ?: 'item';
                $existing = $row->items()->where('slug', $slug)->first();
                $values = [
                    'title' => mb_substr($title, 0, 200),
                    'data' => CollectionFields::cleanData($row->fields ?? [], array_merge($existing?->data ?? [], array_intersect_key($rec, array_flip(array_column($row->fields ?? [], 'key'))))),
                    'published' => ! in_array(strtolower(trim($rec['published'] ?? '1')), ['0', 'false', 'no', 'خیر'], true),
                    'sort' => is_numeric($rec['sort'] ?? null) ? max(-100000, min(100000, (int) $rec['sort'])) : ($existing?->sort ?? 0),
                ];
                if ($existing) {
                    $existing->fill($values)->save();
                    $updated++;
                } else {
                    BuilderCollectionItem::query()->create($values + ['tenant_id' => $row->tenant_id, 'collection_id' => $row->id, 'slug' => $this->uniqueItemSlug($row, $slug)]);
                    $created++;
                }
            }
        });
        fclose($handle);

        return response()->json(['data' => ['created' => $created, 'updated' => $updated, 'skipped' => $skipped, 'truncated' => $n > self::IMPORT_MAX_ROWS]]);
    }

    public function publicItems(Request $request, string $slug): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $collection = BuilderCollection::query()->where('tenant_id', $tid)->where('slug', $slug)->firstOrFail();
        $limit = max(1, min(48, (int) $request->query('limit', 12)));
        $page = max(1, (int) $request->query('page', 1));
        $query = $collection->items()->where('published', true);
        // ?q= (title contains); ?filter[field]=value — exact, `a|b` = any of, list fields (multi-reference/gallery) = contains.
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $query->where('title', 'like', '%'.addcslashes(mb_substr($q, 0, 80), '%_\\').'%');
        }
        $filters = $request->query('filter');
        if (is_array($filters)) {
            $types = collect($collection->fields)->reject(fn ($f) => $f['type'] === 'richtext')->pluck('type', 'key')->all();
            foreach (array_slice($filters, 0, 5, true) as $key => $value) {
                if (! isset($types[$key]) || ! is_scalar($value) || (string) $value === '') {
                    continue;
                }
                $values = array_slice(array_values(array_filter(array_map('trim', explode('|', mb_substr((string) $value, 0, 400))), fn ($v) => $v !== '')), 0, 20);
                if (in_array($types[$key], ['multi_reference', 'gallery'], true)) {
                    $query->where(function ($w) use ($key, $values) {
                        foreach ($values as $v) {
                            $w->orWhere('data->'.$key, 'like', '%'.addcslashes($v, '%_\\').'%');
                        }
                    });
                } elseif (count($values) > 1) {
                    $query->whereIn('data->'.$key, $values);
                } else {
                    $query->where('data->'.$key, $values[0] ?? '');
                }
            }
        }
        $total = (clone $query)->count();
        $sort = (string) $request->query('sort', 'sort');
        $query = match ($sort) {
            'newest' => $query->orderByDesc('id'),
            'oldest' => $query->orderBy('id'),
            'title' => $query->orderBy('title'),
            default => $query->orderBy('sort')->orderByDesc('id'),
        };
        $items = $query->skip(($page - 1) * $limit)->take($limit)->get();
        $refs = $request->boolean('expand') ? $this->references($collection, $items->all()) : [];

        return response()->json(['data' => [
            'collection' => $this->collection($collection),
            'items' => $items->map(fn ($i) => $this->item($i) + ($refs !== [] ? ['refs' => $this->refsFor($collection, $i, $refs)] : []))->values(),
            'total' => $total,
            'page' => $page,
            'pages' => (int) ceil($total / $limit),
        ]])->header('Cache-Control', 'public, max-age=60');
    }

    public function publicItem(Request $request, string $slug, string $item): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $collection = BuilderCollection::query()->where('tenant_id', $tid)->where('slug', $slug)->firstOrFail();
        $row = $collection->items()->where('published', true)->where('slug', $item)->firstOrFail();
        $refs = $this->references($collection, [$row]);

        return response()->json(['data' => [
            'collection' => $this->collection($collection),
            'item' => $this->item($row) + ['refs' => $this->refsFor($collection, $row, $refs)],
            'seo' => CollectionFields::resolveSeo($collection, $row),
        ]]);
    }

    /**
     * Loads referenced items (published only) for the given rows, grouped by target collection.
     *
     * @param  list<BuilderCollectionItem>  $rows
     * @return array<string, array<string, array<string, mixed>>>
     */
    private function references(BuilderCollection $collection, array $rows): array
    {
        $wanted = [];
        foreach ($collection->fields ?? [] as $field) {
            if (! in_array($field['type'], ['reference', 'multi_reference'], true) || empty($field['collection'])) {
                continue;
            }
            foreach ($rows as $row) {
                foreach (CollectionFields::slugList((string) (($row->data ?? [])[$field['key']] ?? '')) as $slug) {
                    $wanted[$field['collection']][$slug] = true;
                }
            }
        }
        $out = [];
        foreach ($wanted as $target => $slugs) {
            $c = BuilderCollection::query()->where('tenant_id', $collection->tenant_id)->where('slug', $target)->first();
            if (! $c) {
                continue;
            }
            foreach ($c->items()->where('published', true)->whereIn('slug', array_slice(array_keys($slugs), 0, 500))->get() as $ref) {
                $out[$target][$ref->slug] = ['slug' => $ref->slug, 'title' => $ref->title, 'data' => $ref->data ?? [], 'url' => '/c/'.$target.'/'.$ref->slug];
            }
        }

        return $out;
    }

    /** @param  array<string, array<string, array<string, mixed>>>  $refs */
    private function refsFor(BuilderCollection $collection, BuilderCollectionItem $row, array $refs): array
    {
        $out = [];
        foreach ($collection->fields ?? [] as $field) {
            if (! in_array($field['type'], ['reference', 'multi_reference'], true) || empty($field['collection'])) {
                continue;
            }
            $out[$field['key']] = array_values(array_filter(array_map(
                fn ($slug) => $refs[$field['collection']][$slug] ?? null,
                CollectionFields::slugList((string) (($row->data ?? [])[$field['key']] ?? ''))
            )));
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function validateCollection(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:120',
            'slug' => 'nullable|string|max:80',
            'fields' => 'required|array|min:1|max:40',
            'fields.*.key' => 'required|string|max:40|regex:/^[a-z][a-z0-9_]*$/',
            'fields.*.label' => 'required|string|max:80',
            'fields.*.type' => 'required|in:'.implode(',', self::FIELD_TYPES),
            'fields.*.options' => 'nullable|string|max:2000',
            'fields.*.collection' => 'nullable|string|max:80',
            'seo' => 'nullable|array',
            'seo.title_template' => 'nullable|string|max:200',
            'seo.description_field' => 'nullable|string|max:40',
            'seo.image_field' => 'nullable|string|max:40',
            'seo.schema_type' => 'nullable|string|in:'.implode(',', CollectionFields::SCHEMA_TYPES),
        ]);
    }

    /** @return array<string, mixed> */
    private function validateItem(Request $request): array
    {
        abort_if(strlen($request->getContent()) > 200_000, 413, 'item too large');

        return $request->validate([
            'title' => 'required|string|max:200',
            'slug' => 'nullable|string|max:120',
            'data' => 'nullable|array',
            'published' => 'nullable|boolean',
            'sort' => 'nullable|integer|min:-100000|max:100000',
            'seo' => 'nullable|array',
            'seo.title' => 'nullable|string|max:200',
            'seo.description' => 'nullable|string|max:400',
            'seo.image' => 'nullable|string|max:500',
            'seo.noindex' => 'nullable|boolean',
        ]);
    }

    private function uniqueItemSlug(BuilderCollection $row, string $slug, ?int $ignore = null): string
    {
        $base = mb_substr($slug, 0, 110);
        $candidate = $base;
        $n = 2;
        while ($row->items()->where('slug', $candidate)->when($ignore, fn ($q) => $q->where('id', '!=', $ignore))->exists()) {
            $candidate = $base.'-'.$n++;
        }

        return $candidate;
    }

    private function find(Request $request, int $id): BuilderCollection
    {
        return BuilderCollection::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($id);
    }

    /** @return array<string, mixed> */
    private function collection(BuilderCollection $c): array
    {
        return ['id' => $c->id, 'slug' => $c->slug, 'name' => $c->name, 'fields' => $c->fields, 'seo' => $c->seo];
    }

    /** @return array<string, mixed> */
    private function item(BuilderCollectionItem $i, bool $admin = false): array
    {
        return ['id' => $i->id, 'slug' => $i->slug, 'title' => $i->title, 'data' => $i->data ?? [], 'published' => (bool) $i->published, 'sort' => $i->sort]
            + ($admin ? ['seo' => $i->seo] : []);
    }
}
