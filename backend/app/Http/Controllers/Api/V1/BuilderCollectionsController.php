<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\BuilderCollection;
use App\Models\BuilderCollectionItem;
use App\Services\Builder\BuilderAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** CMS Collections: custom content types (fields) with items, listed by the Loop Grid widget. */
class BuilderCollectionsController extends Controller
{
    use ResolvesPublicTenant;

    public const FIELD_TYPES = ['text', 'textarea', 'richtext', 'image', 'url', 'number', 'date'];

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
        $row = BuilderCollection::query()->create(['tenant_id' => $tid, 'slug' => $slug, 'name' => strip_tags($data['name']), 'fields' => $this->fields($data['fields'])]);

        return response()->json(['data' => $this->collection($row)], 201);
    }

    public function update(Request $request, int $collection): JsonResponse
    {
        BuilderAccess::authorize($request, 'design');
        $row = $this->find($request, $collection);
        $data = $this->validateCollection($request);
        $row->fill(['name' => strip_tags($data['name']), 'fields' => $this->fields($data['fields'])])->save();

        return response()->json(['data' => $this->collection($row)]);
    }

    public function destroy(Request $request, int $collection): JsonResponse
    {
        BuilderAccess::authorize($request, 'design');
        $this->find($request, $collection)->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function items(Request $request, int $collection): JsonResponse
    {
        $row = $this->find($request, $collection);

        return response()->json(['data' => $row->items()->orderBy('sort')->orderByDesc('id')->limit(500)->get()->map(fn ($i) => $this->item($i))->values()]);
    }

    public function storeItem(Request $request, int $collection): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $row = $this->find($request, $collection);
        $data = $this->validateItem($request);
        $slug = $this->uniqueItemSlug($row, Str::slug($data['slug'] ?? '') ?: Str::slug($data['title']) ?: 'item');
        $item = BuilderCollectionItem::query()->create([
            'tenant_id' => $row->tenant_id, 'collection_id' => $row->id, 'slug' => $slug, 'title' => strip_tags($data['title']),
            'data' => $this->cleanData($row, $data['data'] ?? []), 'published' => $data['published'] ?? true, 'sort' => $data['sort'] ?? 0,
        ]);

        return response()->json(['data' => $this->item($item)], 201);
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
            'slug' => $slug, 'title' => strip_tags($data['title']), 'data' => $this->cleanData($row, $data['data'] ?? []),
            'published' => $data['published'] ?? $model->published, 'sort' => $data['sort'] ?? $model->sort,
        ])->save();

        return response()->json(['data' => $this->item($model)]);
    }

    public function destroyItem(Request $request, int $collection, int $item): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $this->find($request, $collection)->items()->findOrFail($item)->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function publicItems(Request $request, string $slug): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $collection = BuilderCollection::query()->where('tenant_id', $tid)->where('slug', $slug)->firstOrFail();
        $limit = max(1, min(48, (int) $request->query('limit', 12)));
        $page = max(1, (int) $request->query('page', 1));
        $query = $collection->items()->where('published', true);
        $total = (clone $query)->count();
        $sort = (string) $request->query('sort', 'sort');
        $query = match ($sort) {
            'newest' => $query->orderByDesc('id'),
            'title' => $query->orderBy('title'),
            default => $query->orderBy('sort')->orderByDesc('id'),
        };
        $items = $query->skip(($page - 1) * $limit)->take($limit)->get();

        return response()->json(['data' => [
            'collection' => $this->collection($collection),
            'items' => $items->map(fn ($i) => $this->item($i))->values(),
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

        return response()->json(['data' => ['collection' => $this->collection($collection), 'item' => $this->item($row)]]);
    }

    /** @return array<string, mixed> */
    private function validateCollection(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:120',
            'slug' => 'nullable|string|max:80',
            'fields' => 'required|array|min:1|max:30',
            'fields.*.key' => 'required|string|max:40|regex:/^[a-z][a-z0-9_]*$/',
            'fields.*.label' => 'required|string|max:80',
            'fields.*.type' => 'required|in:'.implode(',', self::FIELD_TYPES),
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
        ]);
    }

    /** @param  list<array<string, string>>  $fields */
    private function fields(array $fields): array
    {
        $out = [];
        foreach ($fields as $f) {
            $out[$f['key']] = ['key' => $f['key'], 'label' => strip_tags($f['label']), 'type' => $f['type']];
        }

        return array_values($out);
    }

    /** Keeps only declared fields; values are length-capped strings (URLs must be https or site-relative). */
    private function cleanData(BuilderCollection $collection, array $data): array
    {
        $out = [];
        foreach ($collection->fields as $field) {
            $value = $data[$field['key']] ?? null;
            if ($value === null || is_array($value)) {
                continue;
            }
            $value = trim((string) $value);
            if (in_array($field['type'], ['image', 'url'], true) && $value !== '' && ! preg_match('#^(https://|/(?!/))[^\s"<>]*$#', $value)) {
                continue;
            }
            if ($field['type'] === 'number' && $value !== '' && ! is_numeric($value)) {
                continue;
            }
            $out[$field['key']] = mb_substr($field['type'] === 'richtext' ? $value : strip_tags($value), 0, $field['type'] === 'richtext' ? 20000 : 5000);
        }

        return $out;
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
        return ['id' => $c->id, 'slug' => $c->slug, 'name' => $c->name, 'fields' => $c->fields];
    }

    /** @return array<string, mixed> */
    private function item(BuilderCollectionItem $i): array
    {
        return ['id' => $i->id, 'slug' => $i->slug, 'title' => $i->title, 'data' => $i->data ?? [], 'published' => (bool) $i->published, 'sort' => $i->sort];
    }
}
