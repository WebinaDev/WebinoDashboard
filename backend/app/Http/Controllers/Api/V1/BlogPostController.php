<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\BlogTag;
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
            'total' => (clone $base)->count(),
            'publish' => (clone $base)->where('status', 'published')->count(),
            'draft' => (clone $base)->where('status', 'draft')->count(),
            'pending' => 0,
        ];
        if ($search = trim((string) $request->query('search', ''))) {
            $base->where(function ($w) use ($search) {
                $like = '%'.$search.'%';
                $w->where('title', 'like', $like)->orWhere('excerpt', 'like', $like);
            });
        }
        $total = (clone $base)->count();
        $rows = $base->with(['category:id,name,slug', 'tags:id,name'])
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
            ->with(['category:id,name,slug', 'tags:id,name'])
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
        unset($data['tags']);

        $row = BlogPost::query()->create([
            'tenant_id' => $tid,
            'slug' => $slug ?: 'post-'.Str::random(6),
            ...$data,
        ]);
        $this->syncTags($row, (int) $tid, $tagNames);

        return response()->json(['data' => $this->serializeDetail($row->fresh(['category', 'tags']))], 201);
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
        unset($data['tags']);
        $row->update($data);
        if ($tagNames !== null) {
            $this->syncTags($row, (int) $tid, $tagNames);
        }

        return response()->json(['data' => $this->serializeDetail($row->fresh(['category', 'tags']))]);
    }

    public function destroy(Request $request, int $post): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        BlogPost::query()->where('tenant_id', $tid)->where('id', $post)->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    /**
     * @return array<string, mixed>
     */
    protected function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'category_id' => 'nullable|integer',
            'slug' => 'nullable|string|max:120',
            'title' => $req.'|string|max:255',
            'excerpt' => 'nullable|string',
            'body' => 'nullable|string',
            'cover_url' => 'nullable|string|max:500',
            'status' => 'nullable|string|in:draft,published',
            'published_at' => 'nullable|date',
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:120',
        ]);
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
            'category' => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
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
            'cover_url' => $p->cover_url,
            'category_id' => $p->category_id,
            'category' => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
            'tags' => $p->tags->map(fn ($t) => ['id' => $t->id, 'name' => $t->name])->all(),
        ];
    }
}
