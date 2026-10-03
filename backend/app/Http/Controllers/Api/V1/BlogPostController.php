<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Models\BlogTag;
use App\Models\MediaAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BlogPostController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));
        $base = BlogPost::query()->where('tenant_id', $tid);
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
        $rows = $base->with(['category:id,name,slug', 'categories:id,name', 'tags:id,name'])
            ->orderByDesc('id')
            ->forPage($page, $perPage)
            ->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (BlogPost $p) => $this->serializeList($p))->all(),
                'page' => $page,
                'found' => $total,
                'stats' => $stats,
            ],
        ]);
    }

    public function show(Request $request, int $post): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = BlogPost::query()->where('tenant_id', $tid)
            ->with(['category:id,name,slug', 'categories:id,name', 'tags:id,name', 'coverMedia'])
            ->findOrFail($post);

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
        $tagNames = $data['tags'] ?? [];
        $categoryIds = $data['categories'] ?? [];
        unset($data['tags'], $data['categories']);
        $this->assertCoverMedia($tid, $data['cover_media_id'] ?? null);

        $row = BlogPost::query()->create([
            'tenant_id' => $tid,
            'slug' => $slug ?: 'post-'.Str::random(6),
            ...$data,
        ]);
        $this->syncTags($row, (int) $tid, $tagNames);
        $this->syncCategories($row, (int) $tid, $categoryIds, $data['category_id'] ?? null);

        return response()->json(['data' => $this->serializeDetail($row->fresh(['category', 'categories', 'tags', 'coverMedia']))], 201);
    }

    public function update(Request $request, int $post): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = BlogPost::query()->where('tenant_id', $tid)->findOrFail($post);
        $data = $this->validated($request, partial: true);
        if (($data['status'] ?? null) === 'published' && empty($data['published_at']) && ! $row->published_at) {
            $data['published_at'] = now();
        }
        $tagNames = $data['tags'] ?? null;
        $categoryIds = $data['categories'] ?? null;
        unset($data['tags'], $data['categories']);
        if (array_key_exists('cover_media_id', $data)) {
            $this->assertCoverMedia($tid, $data['cover_media_id']);
        }
        $row->update($data);
        if ($tagNames !== null) {
            $this->syncTags($row, (int) $tid, $tagNames);
        }
        if ($categoryIds !== null) {
            $this->syncCategories($row, (int) $tid, $categoryIds, $data['category_id'] ?? $row->category_id);
        }

        return response()->json(['data' => $this->serializeDetail($row->fresh(['category', 'categories', 'tags', 'coverMedia']))]);
    }

    public function destroy(Request $request, int $post): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = BlogPost::query()->where('tenant_id', $tid)->findOrFail($post);

        return response()->json(['data' => \App\Support\StatusTrash::trashOrDelete($row, $request->boolean('force'), 'status', 'draft', ['draft', 'published', 'pending'])]);
    }

    public function restore(Request $request, int $post): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = BlogPost::query()->where('tenant_id', $tid)->findOrFail($post);
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
            'category_id' => 'nullable|integer',
            'categories' => 'nullable|array',
            'categories.*' => 'integer',
            'slug' => 'nullable|string|max:120',
            'title' => $req.'|string|max:255',
            'excerpt' => 'nullable|string',
            'body' => 'nullable|string',
            'cover_url' => 'nullable|string|max:500',
            'cover_media_id' => 'nullable|integer',
            'seo' => 'nullable|array',
            'status' => 'nullable|string|in:draft,published,pending,trash',
            'published_at' => 'nullable|date',
            'comment_status' => 'nullable|string|in:open,closed',
            'visibility' => 'nullable|string|in:public,private,password',
            'password' => 'nullable|string|max:120',
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:120',
        ]);
    }

    private function assertCoverMedia(int $tid, mixed $id): void
    {
        if (! $id) {
            return;
        }
        MediaAsset::query()->where('tenant_id', $tid)->findOrFail((int) $id);
    }

    /** @param  list<string>  $tagNames */
    private function syncTags(BlogPost $row, int $tid, array $tagNames): void
    {
        $tagIds = [];
        foreach ($tagNames as $name) {
            $name = trim((string) $name);
            if ($name === '') {
                continue;
            }
            $slug = Str::slug($name) ?: 'tag-'.Str::random(4);
            $tag = BlogTag::query()->firstOrCreate(
                ['tenant_id' => $tid, 'slug' => $slug],
                ['name' => $name],
            );
            $tagIds[] = $tag->id;
        }
        $row->tags()->sync($tagIds);
    }

    /** @param  list<int>  $categoryIds */
    private function syncCategories(BlogPost $row, int $tid, array $categoryIds, mixed $primaryId): void
    {
        $ids = BlogCategory::query()->where('tenant_id', $tid)->whereIn('id', $categoryIds)->pluck('id')->all();
        $row->categories()->sync($ids);
        $primary = $primaryId ?? ($ids[0] ?? null);
        if ($primary && ! in_array((int) $primary, $ids, true) && $ids !== []) {
            $primary = $ids[0];
        }
        $row->update(['category_id' => $primary]);
    }

    /** @return array<string, mixed> */
    private function serializeList(BlogPost $p): array
    {
        return [
            'id' => $p->id,
            'title' => $p->title,
            'slug' => $p->slug,
            'status' => $p->status,
            'date' => optional($p->published_at ?? $p->created_at)?->toIso8601String(),
            'excerpt' => $p->excerpt,
            'seo' => $p->seo,
            'permalink' => '/blog/'.$p->slug,
            'category' => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
            'categories' => $p->categories->map(fn ($c) => ['id' => $c->id, 'name' => $c->name])->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeDetail(BlogPost $p): array
    {
        return [
            'id' => $p->id,
            'title' => $p->title,
            'slug' => $p->slug,
            'body' => $p->body,
            'excerpt' => $p->excerpt,
            'status' => $p->status,
            'published_at' => optional($p->published_at)?->toIso8601String(),
            'cover_url' => $p->cover_url ?? $p->coverMedia?->url,
            'cover_media_id' => $p->cover_media_id,
            'seo' => $p->seo ?? [],
            'comment_status' => $p->comment_status ?? 'open',
            'visibility' => $p->visibility ?? 'public',
            'password' => '',
            'permalink' => '/blog/'.$p->slug,
            'category_id' => $p->category_id,
            'category' => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
            'categories' => $p->categories->pluck('id')->all(),
            'tags' => $p->tags->map(fn ($t) => ['id' => $t->id, 'name' => $t->name])->all(),
        ];
    }
}
