<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MagazineArticle;
use App\Models\MagazineCategory;
use App\Models\MagazineTag;
use App\Models\MediaAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MagazineArticleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));
        $base = MagazineArticle::query()->where('tenant_id', $tid);
        $stats = [
            'total' => (clone $base)->where('status', '!=', 'trash')->count(),
            'publish' => (clone $base)->where('status', 'published')->count(),
            'draft' => (clone $base)->where('status', 'draft')->count(),
            'pending' => (clone $base)->where('status', 'pending')->count(),
            'trash' => (clone $base)->where('status', 'trash')->count(),
        ];
        \App\Support\StatusTrash::apply($base, $request->filled('status') ? (string) $request->query('status') : null);
        if ($search = trim((string) $request->query('search', ''))) {
            $base->where(function ($w) use ($search) {
                $like = '%'.$search.'%';
                $w->where('title', 'like', $like)->orWhere('excerpt', 'like', $like);
            });
        }
        $total = (clone $base)->count();
        $rows = $base->with(['categories', 'tags', 'featuredMedia'])
            ->orderByDesc('id')
            ->forPage($page, $perPage)
            ->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (MagazineArticle $a) => $this->serializeList($a))->all(),
                'page' => $page,
                'found' => $total,
                'stats' => $stats,
            ],
        ]);
    }

    public function show(Request $request, int $article): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MagazineArticle::query()->where('tenant_id', $tid)
            ->with(['categories', 'tags', 'featuredMedia'])
            ->findOrFail($article);

        return response()->json(['data' => $this->serializeDetail($row)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $tid = $request->user()->tenant_id;
        $slug = $data['slug'] ?? Str::slug($data['title']);
        if (($data['status'] ?? null) === 'published' && empty($data['published_at'])) {
            $data['published_at'] = now();
        }
        $categoryIds = $data['categories'] ?? [];
        $tagNames = $data['tags'] ?? [];
        unset($data['categories'], $data['tags']);
        $this->assertFeatured($tid, $data['featured_media_id'] ?? null);

        $row = MagazineArticle::query()->create([
            'tenant_id' => $tid,
            'slug' => $slug ?: 'post-'.Str::random(6),
            ...$data,
        ]);
        $this->syncTaxonomy($row, (int) $tid, $categoryIds, $tagNames);

        return response()->json(['data' => $this->serializeDetail($row->fresh(['categories', 'tags', 'featuredMedia']))], 201);
    }

    public function update(Request $request, int $article): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MagazineArticle::query()->where('tenant_id', $tid)->findOrFail($article);
        $data = $this->validated($request, partial: true);
        if (($data['status'] ?? null) === 'published') {
            \App\Support\StatusTrash::guardPublish($row);
        }
        if (($data['status'] ?? null) === 'published' && empty($data['published_at']) && ! $row->published_at) {
            $data['published_at'] = now();
        }
        $categoryIds = $data['categories'] ?? null;
        $tagNames = $data['tags'] ?? null;
        unset($data['categories'], $data['tags']);
        if (array_key_exists('featured_media_id', $data)) {
            $this->assertFeatured($tid, $data['featured_media_id']);
        }
        $row->update($data);
        if ($categoryIds !== null || $tagNames !== null) {
            $this->syncTaxonomy(
                $row,
                (int) $tid,
                $categoryIds ?? $row->categories()->pluck('magazine_categories.id')->all(),
                $tagNames ?? $row->tags()->pluck('name')->all(),
            );
        }

        return response()->json(['data' => $this->serializeDetail($row->fresh(['categories', 'tags', 'featuredMedia']))]);
    }

    public function destroy(Request $request, int $article): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MagazineArticle::query()->where('tenant_id', $tid)->findOrFail($article);

        return response()->json(['data' => \App\Support\StatusTrash::trashOrDelete($row, $request->boolean('force'), 'status', 'draft', ['draft', 'published', 'pending'])]);
    }

    public function restore(Request $request, int $article): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MagazineArticle::query()->where('tenant_id', $tid)->findOrFail($article);
        $status = \App\Support\StatusTrash::restore($row, 'status', 'draft', ['draft', 'published', 'pending']);

        return response()->json(['data' => $this->serializeDetail($row->fresh()), 'restored_status' => $status]);
    }

    /**
     * @return array<string, mixed>
     */
    protected function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'slug' => 'nullable|string|max:120',
            'title' => $req.'|string|max:255',
            'excerpt' => 'nullable|string',
            'body' => 'nullable|string',
            'cover_url' => 'nullable|string|max:500',
            'featured_media_id' => 'nullable|integer',
            'status' => 'nullable|string|in:draft,published,pending,trash',
            'published_at' => 'nullable|date',
            'comment_status' => 'nullable|string|in:open,closed',
            'visibility' => 'nullable|string|in:public,private,password',
            'password' => 'nullable|string|max:120',
            'seo' => 'nullable|array',
            'categories' => 'nullable|array',
            'categories.*' => 'integer',
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:120',
        ]);
    }

    private function assertFeatured(int $tid, mixed $id): void
    {
        if (! $id) {
            return;
        }
        MediaAsset::query()->where('tenant_id', $tid)->findOrFail((int) $id);
    }

    /** @param  list<int>  $categoryIds @param  list<string>  $tagNames */
    private function syncTaxonomy(MagazineArticle $row, int $tid, array $categoryIds, array $tagNames): void
    {
        $catIds = MagazineCategory::query()->where('tenant_id', $tid)->whereIn('id', $categoryIds)->pluck('id')->all();
        $row->categories()->sync($catIds);
        $tagIds = [];
        foreach ($tagNames as $name) {
            $name = trim((string) $name);
            if ($name === '') {
                continue;
            }
            $slug = Str::slug($name) ?: 'tag-'.Str::random(4);
            $tag = MagazineTag::query()->firstOrCreate(
                ['tenant_id' => $tid, 'slug' => $slug],
                ['name' => $name],
            );
            $tagIds[] = $tag->id;
        }
        $row->tags()->sync($tagIds);
    }

    /** @return array<string, mixed> */
    private function serializeList(MagazineArticle $a): array
    {
        return [
            'id' => $a->id,
            'title' => $a->title,
            'slug' => $a->slug,
            'status' => $a->status,
            'date' => optional($a->published_at ?? $a->created_at)?->toIso8601String(),
            'excerpt' => $a->excerpt,
            'seo' => $a->seo,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeDetail(MagazineArticle $a): array
    {
        return [
            'id' => $a->id,
            'title' => $a->title,
            'slug' => $a->slug,
            'content' => $a->body,
            'body' => $a->body,
            'excerpt' => $a->excerpt,
            'status' => $a->status,
            'published_at' => optional($a->published_at)?->toIso8601String(),
            'comment_status' => $a->comment_status ?? 'open',
            'visibility' => $a->visibility ?? 'public',
            'password' => $a->password ? '' : '',
            'seo' => $a->seo ?? [],
            'cover_url' => $a->cover_url,
            'featured_media_id' => $a->featured_media_id,
            'featured_image_url' => $a->featuredMedia?->url,
            'categories' => $a->categories->pluck('id')->all(),
            'tags' => $a->tags->map(fn ($t) => ['id' => $t->id, 'name' => $t->name])->all(),
        ];
    }
}
