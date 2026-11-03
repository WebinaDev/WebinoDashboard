<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportKbArticle;
use App\Models\SupportKbCategory;
use App\Services\Support\SupportTicketService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SupportKnowledgeController extends Controller
{
    public function categories(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $rows = SupportKbCategory::query()->where('tenant_id', $tid)->orderBy('sort_order')->orderBy('id')->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (SupportKbCategory $c) => $this->mapCategory($c))->all(),
            ],
        ]);
    }

    public function storeCategory(Request $request, SupportTicketService $tickets): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'name_fa' => ['required', 'string', 'max:160'],
            'name_en' => ['nullable', 'string', 'max:160'],
            'slug' => ['nullable', 'string', 'max:100'],
            'description_fa' => ['nullable', 'string', 'max:2000'],
            'description_en' => ['nullable', 'string', 'max:2000'],
            'parent_id' => ['nullable', 'integer', Rule::exists('support_kb_categories', 'id')->where(fn ($q) => $q->where('tenant_id', $tid))],
            'is_public' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);
        $slug = $data['slug'] ?? $tickets->slugify($data['name_en'] ?: $data['name_fa']);
        $row = SupportKbCategory::query()->create([
            'tenant_id' => $tid,
            'name_fa' => $data['name_fa'],
            'name_en' => $data['name_en'] ?? null,
            'slug' => $slug,
            'description_fa' => $data['description_fa'] ?? null,
            'description_en' => $data['description_en'] ?? null,
            'parent_id' => $data['parent_id'] ?? null,
            'is_public' => (bool) ($data['is_public'] ?? true),
            'sort_order' => (int) ($data['sort_order'] ?? 0),
        ]);

        return response()->json(['data' => $this->mapCategory($row)], 201);
    }

    public function updateCategory(Request $request, int $category): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $row = SupportKbCategory::query()->where('tenant_id', $tid)->where('id', $category)->firstOrFail();
        $data = $request->validate([
            'name_fa' => ['sometimes', 'string', 'max:160'],
            'name_en' => ['nullable', 'string', 'max:160'],
            'slug' => ['nullable', 'string', 'max:100'],
            'description_fa' => ['nullable', 'string', 'max:2000'],
            'description_en' => ['nullable', 'string', 'max:2000'],
            'parent_id' => ['nullable', 'integer'],
            'is_public' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);
        $row->fill($data)->save();

        return response()->json(['data' => $this->mapCategory($row)]);
    }

    public function destroyCategory(Request $request, int $category): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        SupportKbCategory::query()->where('tenant_id', $tid)->where('id', $category)->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function articles(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $q = SupportKbArticle::query()->where('tenant_id', $tid)->with('category');
        if ($search = trim((string) $request->query('search', ''))) {
            $q->where(function ($qq) use ($search) {
                $qq->where('title_fa', 'like', '%'.$search.'%')
                    ->orWhere('title_en', 'like', '%'.$search.'%')
                    ->orWhere('body_fa', 'like', '%'.$search.'%');
            });
        }
        if ($cat = (int) $request->query('category_id', 0)) {
            $q->where('category_id', $cat);
        }
        $rows = $q->orderByDesc('updated_at')->limit(200)->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (SupportKbArticle $a) => $this->mapArticle($a))->all(),
            ],
        ]);
    }

    public function storeArticle(Request $request, SupportTicketService $tickets): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $this->articleValidated($request, $tid);
        $slug = $data['slug'] ?? $tickets->slugify($data['title_en'] ?? $data['title_fa']);
        $published = (bool) ($data['is_published'] ?? false);
        $row = SupportKbArticle::query()->create([
            'tenant_id' => $tid,
            'category_id' => $data['category_id'] ?? null,
            'title_fa' => $data['title_fa'],
            'title_en' => $data['title_en'] ?? null,
            'slug' => Str::limit($slug, 140, ''),
            'body_fa' => $data['body_fa'],
            'body_en' => $data['body_en'] ?? null,
            'excerpt_fa' => $data['excerpt_fa'] ?? null,
            'excerpt_en' => $data['excerpt_en'] ?? null,
            'tags' => $data['tags'] ?? null,
            'is_published' => $published,
            'is_public' => (bool) ($data['is_public'] ?? true),
            'show_in_widget' => (bool) ($data['show_in_widget'] ?? true),
            'author_id' => (int) $request->user()->id,
            'published_at' => $published ? now() : null,
        ]);

        return response()->json(['data' => $this->mapArticle($row->load('category'))], 201);
    }

    public function updateArticle(Request $request, int $article): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $row = SupportKbArticle::query()->where('tenant_id', $tid)->where('id', $article)->firstOrFail();
        $data = $this->articleValidated($request, $tid, partial: true);
        if (array_key_exists('is_published', $data) && $data['is_published'] && ! $row->published_at) {
            $data['published_at'] = now();
        }
        $row->fill($data)->save();

        return response()->json(['data' => $this->mapArticle($row->fresh('category'))]);
    }

    public function destroyArticle(Request $request, int $article): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        SupportKbArticle::query()->where('tenant_id', $tid)->where('id', $article)->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function publicIndex(Request $request): JsonResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');
        $widget = $request->boolean('widget');
        $q = SupportKbArticle::query()
            ->where('tenant_id', $tid)
            ->where('is_published', true)
            ->where('is_public', true);
        if ($widget) {
            $q->where('show_in_widget', true);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $q->where(function ($qq) use ($search) {
                $qq->where('title_fa', 'like', '%'.$search.'%')
                    ->orWhere('title_en', 'like', '%'.$search.'%')
                    ->orWhere('excerpt_fa', 'like', '%'.$search.'%');
            });
        }
        $rows = $q->orderByDesc('published_at')->limit($widget ? 8 : 50)->get();
        $cats = SupportKbCategory::query()
            ->where('tenant_id', $tid)
            ->where('is_public', true)
            ->orderBy('sort_order')
            ->get();

        return response()->json([
            'data' => [
                'categories' => $cats->map(fn (SupportKbCategory $c) => [
                    'id' => $c->id,
                    'name_fa' => $c->name_fa,
                    'name_en' => $c->name_en,
                    'slug' => $c->slug,
                ])->all(),
                'items' => $rows->map(fn (SupportKbArticle $a) => [
                    'id' => $a->id,
                    'slug' => $a->slug,
                    'title_fa' => $a->title_fa,
                    'title_en' => $a->title_en,
                    'excerpt_fa' => $a->excerpt_fa,
                    'excerpt_en' => $a->excerpt_en,
                    'category_id' => $a->category_id,
                    'tags' => $a->tags ?? [],
                ])->all(),
            ],
        ]);
    }

    public function publicShow(Request $request, string $slug): JsonResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');
        $row = SupportKbArticle::query()
            ->where('tenant_id', $tid)
            ->where('slug', $slug)
            ->where('is_published', true)
            ->where('is_public', true)
            ->firstOrFail();
        $row->increment('view_count');

        return response()->json([
            'data' => [
                'id' => $row->id,
                'slug' => $row->slug,
                'title_fa' => $row->title_fa,
                'title_en' => $row->title_en,
                'body_fa' => $row->body_fa,
                'body_en' => $row->body_en,
                'excerpt_fa' => $row->excerpt_fa,
                'excerpt_en' => $row->excerpt_en,
                'tags' => $row->tags ?? [],
                'helpful_yes' => $row->helpful_yes,
                'helpful_no' => $row->helpful_no,
            ],
        ]);
    }

    public function publicFeedback(Request $request, string $slug): JsonResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');
        $row = SupportKbArticle::query()
            ->where('tenant_id', $tid)
            ->where('slug', $slug)
            ->where('is_published', true)
            ->firstOrFail();
        $data = $request->validate(['helpful' => ['required', 'boolean']]);
        if ($data['helpful']) {
            $row->increment('helpful_yes');
        } else {
            $row->increment('helpful_no');
        }

        return response()->json(['data' => ['ok' => true]]);
    }

    /** @return array<string, mixed> */
    private function articleValidated(Request $request, int $tenantId, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'title_fa' => [$req, 'string', 'max:240'],
            'title_en' => ['nullable', 'string', 'max:240'],
            'slug' => ['nullable', 'string', 'max:140'],
            'body_fa' => [$req, 'string', 'max:100000'],
            'body_en' => ['nullable', 'string', 'max:100000'],
            'excerpt_fa' => ['nullable', 'string', 'max:500'],
            'excerpt_en' => ['nullable', 'string', 'max:500'],
            'category_id' => ['nullable', 'integer', Rule::exists('support_kb_categories', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId))],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'is_published' => ['sometimes', 'boolean'],
            'is_public' => ['sometimes', 'boolean'],
            'show_in_widget' => ['sometimes', 'boolean'],
        ]);
    }

    /** @return array<string, mixed> */
    private function mapCategory(SupportKbCategory $c): array
    {
        return [
            'id' => $c->id,
            'parent_id' => $c->parent_id,
            'name_fa' => $c->name_fa,
            'name_en' => $c->name_en,
            'slug' => $c->slug,
            'description_fa' => $c->description_fa,
            'description_en' => $c->description_en,
            'is_public' => (bool) $c->is_public,
            'sort_order' => (int) $c->sort_order,
        ];
    }

    /** @return array<string, mixed> */
    private function mapArticle(SupportKbArticle $a): array
    {
        return [
            'id' => $a->id,
            'category_id' => $a->category_id,
            'category_name' => $a->category?->name_fa ?? $a->category?->name_en,
            'title_fa' => $a->title_fa,
            'title_en' => $a->title_en,
            'slug' => $a->slug,
            'body_fa' => $a->body_fa,
            'body_en' => $a->body_en,
            'excerpt_fa' => $a->excerpt_fa,
            'excerpt_en' => $a->excerpt_en,
            'tags' => $a->tags ?? [],
            'is_published' => (bool) $a->is_published,
            'is_public' => (bool) $a->is_public,
            'show_in_widget' => (bool) $a->show_in_widget,
            'view_count' => (int) $a->view_count,
            'helpful_yes' => (int) $a->helpful_yes,
            'helpful_no' => (int) $a->helpful_no,
            'published_at' => optional($a->published_at)?->toIso8601String(),
            'updated_at' => optional($a->updated_at)?->toIso8601String(),
        ];
    }
}
