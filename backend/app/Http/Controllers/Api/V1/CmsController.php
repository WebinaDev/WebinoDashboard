<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CmsPage;
use App\Models\MediaAsset;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CmsController extends Controller
{
    public function pages(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));
        $base = CmsPage::query()->where('tenant_id', $tid);
        $stats = [
            'total' => (clone $base)->count(),
            'publish' => (clone $base)->where(function ($q) {
                $q->where('status', 'published')->orWhere('published', true);
            })->count(),
            'draft' => (clone $base)->where(function ($q) {
                $q->where('status', 'draft')->orWhere(function ($w) {
                    $w->where('published', false)->where(function ($x) {
                        $x->whereNull('status')->orWhere('status', 'draft');
                    });
                });
            })->count(),
            'pending' => (clone $base)->where('status', 'pending')->count(),
        ];
        if ($search = trim((string) $request->query('search', ''))) {
            $like = '%'.$search.'%';
            $base->where(function ($w) use ($like) {
                $w->where('title', 'like', $like)->orWhere('slug', 'like', $like);
            });
        }
        $total = (clone $base)->count();
        $rows = $base->with('featuredMedia')->orderBy('title')->forPage($page, $perPage)->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (CmsPage $p) => $this->serializeList($p))->all(),
                'page' => $page,
                'found' => $total,
                'stats' => $stats,
            ],
        ]);
    }

    public function show(Request $request, int $page): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = CmsPage::query()->where('tenant_id', $tid)->with('featuredMedia')->findOrFail($page);

        return response()->json(['data' => $this->serializeDetail($row)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $tid = $request->user()->tenant_id;
        $this->assertParent($tid, $data['parent_id'] ?? null);
        $this->assertFeatured($tid, $data['featured_media_id'] ?? null);
        $status = $data['status'] ?? (($data['published'] ?? false) ? 'published' : 'draft');
        $row = CmsPage::query()->create([
            'tenant_id' => $tid,
            'slug' => $data['slug'] ?? Str::slug($data['title']) ?: 'page-'.Str::random(4),
            'title' => $data['title'],
            'excerpt' => $data['excerpt'] ?? null,
            'body' => $data['body'] ?? null,
            'parent_id' => $data['parent_id'] ?? null,
            'status' => $status,
            'published' => $status === 'published',
            'featured_media_id' => $data['featured_media_id'] ?? null,
            'comment_status' => $data['comment_status'] ?? 'closed',
            'visibility' => $data['visibility'] ?? 'public',
            'password' => $data['password'] ?? null,
            'seo' => $data['seo'] ?? null,
        ]);

        return response()->json(['data' => $this->serializeDetail($row->fresh('featuredMedia'))], 201);
    }

    public function update(Request $request, int $page): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = CmsPage::query()->where('tenant_id', $tid)->findOrFail($page);
        $data = $this->validated($request, partial: true);
        if (array_key_exists('parent_id', $data)) {
            abort_if($data['parent_id'] && (int) $data['parent_id'] === $row->id, 422);
            $this->assertParent($tid, $data['parent_id']);
        }
        if (array_key_exists('featured_media_id', $data)) {
            $this->assertFeatured($tid, $data['featured_media_id']);
        }
        if (isset($data['status'])) {
            $data['published'] = $data['status'] === 'published';
        } elseif (array_key_exists('published', $data)) {
            $data['status'] = $data['published'] ? 'published' : 'draft';
        }
        $row->update($data);

        return response()->json(['data' => $this->serializeDetail($row->fresh('featuredMedia'))]);
    }

    public function destroy(Request $request, int $page): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        CmsPage::query()->where('tenant_id', $tid)->where('parent_id', $page)->update(['parent_id' => null]);
        CmsPage::query()->where('tenant_id', $tid)->where('id', $page)->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function homeBlocks(Request $request): JsonResponse
    {
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);

        return response()->json(['data' => $tenant->home_blocks ?? []]);
    }

    public function updateHomeBlocks(Request $request): JsonResponse
    {
        $data = $request->validate(['blocks' => 'required|array']);
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);
        $tenant->update(['home_blocks' => $data['blocks']]);

        return response()->json(['data' => $tenant->home_blocks]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'title' => $req.'|string|max:255',
            'slug' => 'nullable|string|max:120',
            'excerpt' => 'nullable|string',
            'body' => 'nullable|string',
            'published' => 'sometimes|boolean',
            'status' => 'nullable|string|in:draft,published,pending',
            'parent_id' => 'nullable|integer',
            'featured_media_id' => 'nullable|integer',
            'comment_status' => 'nullable|string|in:open,closed',
            'visibility' => 'nullable|string|in:public,private,password',
            'password' => 'nullable|string|max:120',
            'seo' => 'nullable|array',
        ]);
    }

    private function assertParent(int $tid, mixed $id): void
    {
        if (! $id) {
            return;
        }
        CmsPage::query()->where('tenant_id', $tid)->findOrFail((int) $id);
    }

    private function assertFeatured(int $tid, mixed $id): void
    {
        if (! $id) {
            return;
        }
        MediaAsset::query()->where('tenant_id', $tid)->findOrFail((int) $id);
    }

    /** @return array<string, mixed> */
    private function serializeList(CmsPage $p): array
    {
        $status = $p->status ?: ($p->published ? 'published' : 'draft');

        return [
            'id' => $p->id,
            'title' => $p->title,
            'slug' => $p->slug,
            'status' => $status,
            'date' => optional($p->updated_at)?->toIso8601String(),
            'excerpt' => $p->excerpt,
            'parent' => $p->parent_id,
            'url' => '/'.$p->slug,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeDetail(CmsPage $p): array
    {
        $status = $p->status ?: ($p->published ? 'published' : 'draft');

        return [
            'id' => $p->id,
            'title' => $p->title,
            'slug' => $p->slug,
            'content' => $p->body,
            'body' => $p->body,
            'excerpt' => $p->excerpt,
            'status' => $status,
            'published' => $status === 'published',
            'parent' => $p->parent_id,
            'parent_id' => $p->parent_id,
            'featured_media_id' => $p->featured_media_id,
            'featured_image_url' => $p->featuredMedia?->url,
            'comment_status' => $p->comment_status ?? 'closed',
            'visibility' => $p->visibility ?? 'public',
            'password' => '',
            'seo' => $p->seo ?? [],
        ];
    }
}
