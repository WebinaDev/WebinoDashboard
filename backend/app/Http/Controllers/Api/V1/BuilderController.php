<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\BuilderTemplate;
use App\Models\CmsPage;
use App\Models\MagazineArticle;
use App\Models\Product;
use App\Models\Tenant;
use App\Services\Builder\BuilderDocumentRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BuilderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $tenant = Tenant::query()->findOrFail($tid);
        $pages = CmsPage::query()->where('tenant_id', $tid)->where(function ($q) {
            $q->whereNull('status')->orWhere('status', '!=', 'trash');
        })->orderBy('title')->get();
        $templates = BuilderTemplate::query()
            ->where('tenant_id', $tid)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get()
            ->unique('kind')
            ->keyBy('kind');

        return response()->json([
            'data' => [
                'active_theme_slug' => $tenant->active_theme_slug,
                'pages' => $pages->map(fn (CmsPage $page) => $this->serializeList($page))->values(),
                'templates' => [
                    'header' => $this->templateSummary($templates->get('header')),
                    'footer' => $this->templateSummary($templates->get('footer')),
                ],
            ],
        ]);
    }

    public function show(Request $request, int $page): JsonResponse
    {
        $row = $this->page($request, $page);

        return response()->json(['data' => $this->serializeDetail($row)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:120',
            'document' => 'nullable|array',
        ]);
        $tid = (int) $request->user()->tenant_id;
        $slug = $this->slug($data['slug'] ?? null, $data['title']);
        abort_if(
            CmsPage::query()->where('tenant_id', $tid)->where('slug', $slug)->exists(),
            422,
            'slug taken'
        );

        $row = CmsPage::query()->create([
            'tenant_id' => $tid,
            'title' => $data['title'],
            'slug' => $slug,
            'body' => null,
            'published' => false,
            'status' => 'draft',
            'builder_draft' => $this->document($data['document'] ?? ['version' => 1, 'sections' => []]),
        ]);

        return response()->json(['data' => $this->serializeDetail($row)], 201);
    }

    public function update(Request $request, int $page): JsonResponse
    {
        $row = $this->page($request, $page);
        $data = $request->validate([
            'title' => 'sometimes|string|max:255',
            'slug' => 'sometimes|string|max:120',
            'document' => 'sometimes|array',
        ]);
        if (isset($data['slug'])) {
            $slug = $this->slug($data['slug'], $row->title);
            abort_if(
                CmsPage::query()->where('tenant_id', $row->tenant_id)->where('slug', $slug)->where('id', '!=', $row->id)->exists(),
                422,
                'slug taken'
            );
            $row->slug = $slug;
        }
        if (isset($data['title'])) {
            $row->title = $data['title'];
        }
        if (array_key_exists('document', $data)) {
            $row->builder_draft = $this->document($data['document']);
        }
        $row->save();

        return response()->json(['data' => $this->serializeDetail($row)]);
    }

    public function publish(Request $request, int $page): JsonResponse
    {
        $row = $this->page($request, $page);
        abort_if(! is_array($row->builder_draft), 422, 'draft missing');
        $row->builder_published = $row->builder_draft;
        $row->published = true;
        $row->status = 'published';
        $row->save();

        return response()->json(['data' => $this->serializeDetail($row)]);
    }

    public function showProduct(Request $request, Product $product): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $product->tenant_id, 403);

        return response()->json(['data' => $this->metaDocument($product, (string) $product->name, (string) $product->slug, (string) $product->status)]);
    }

    public function updateProduct(Request $request, Product $product): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $product->tenant_id, 403);
        $data = $request->validate([
            'title' => 'sometimes|string|max:255',
            'document' => 'sometimes|array',
        ]);
        if (isset($data['title'])) {
            $product->name = $data['title'];
        }
        if (array_key_exists('document', $data)) {
            $meta = is_array($product->meta) ? $product->meta : [];
            $meta['builder_document'] = $this->document($data['document']);
            $product->meta = $meta;
        }
        $product->save();

        return response()->json(['data' => $this->metaDocument($product, (string) $product->name, (string) $product->slug, (string) $product->status)]);
    }

    public function publishProduct(Request $request, Product $product): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $product->tenant_id, 403);
        $meta = is_array($product->meta) ? $product->meta : [];
        abort_if(! is_array($meta['builder_document'] ?? null), 422, 'draft missing');
        $meta['builder_published'] = $meta['builder_document'];
        $product->meta = $meta;
        $product->save();

        return response()->json(['data' => $this->metaDocument($product, (string) $product->name, (string) $product->slug, (string) $product->status)]);
    }

    public function showPost(Request $request, int $post): JsonResponse
    {
        $row = BlogPost::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($post);

        return response()->json(['data' => $this->columnDocument($row, 'builder_draft', 'builder_published')]);
    }

    public function updatePost(Request $request, int $post): JsonResponse
    {
        $row = BlogPost::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($post);
        $data = $request->validate([
            'title' => 'sometimes|string|max:255',
            'document' => 'sometimes|array',
        ]);
        if (isset($data['title'])) {
            $row->title = $data['title'];
        }
        if (array_key_exists('document', $data)) {
            $row->builder_draft = $this->document($data['document']);
        }
        $row->save();

        return response()->json(['data' => $this->columnDocument($row, 'builder_draft', 'builder_published')]);
    }

    public function publishPost(Request $request, int $post): JsonResponse
    {
        $row = BlogPost::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($post);
        abort_if(! is_array($row->builder_draft), 422, 'draft missing');
        $row->builder_published = $row->builder_draft;
        $row->status = 'published';
        if (! $row->published_at) {
            $row->published_at = now();
        }
        $row->save();

        return response()->json(['data' => $this->columnDocument($row, 'builder_draft', 'builder_published')]);
    }

    public function showArticle(Request $request, int $article): JsonResponse
    {
        $row = MagazineArticle::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($article);

        return response()->json(['data' => $this->metaDocument($row, (string) $row->title, (string) $row->slug, (string) $row->status)]);
    }

    public function updateArticle(Request $request, int $article): JsonResponse
    {
        $row = MagazineArticle::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($article);
        $data = $request->validate([
            'title' => 'sometimes|string|max:255',
            'document' => 'sometimes|array',
        ]);
        if (isset($data['title'])) {
            $row->title = $data['title'];
        }
        if (array_key_exists('document', $data)) {
            $meta = is_array($row->meta) ? $row->meta : [];
            $meta['builder_document'] = $this->document($data['document']);
            $row->meta = $meta;
        }
        $row->save();

        return response()->json(['data' => $this->metaDocument($row, (string) $row->title, (string) $row->slug, (string) $row->status)]);
    }

    public function publishArticle(Request $request, int $article): JsonResponse
    {
        $row = MagazineArticle::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($article);
        $meta = is_array($row->meta) ? $row->meta : [];
        abort_if(! is_array($meta['builder_document'] ?? null), 422, 'draft missing');
        $meta['builder_published'] = $meta['builder_document'];
        $row->meta = $meta;
        $row->status = 'published';
        if (! $row->published_at) {
            $row->published_at = now();
        }
        $row->save();

        return response()->json(['data' => $this->metaDocument($row, (string) $row->title, (string) $row->slug, (string) $row->status)]);
    }

    public function destroy(Request $request, int $page): JsonResponse
    {
        $this->page($request, $page)->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function showTemplate(Request $request, string $kind): JsonResponse
    {
        $kind = $this->kind($kind);
        $row = BuilderTemplate::preferred((int) $request->user()->tenant_id, $kind);

        return response()->json(['data' => [
            'kind' => $kind,
            'title' => $row?->title,
            'document' => $row?->draft,
            'published_document' => $row?->published,
        ]]);
    }

    public function saveTemplate(Request $request, string $kind): JsonResponse
    {
        $kind = $this->kind($kind);
        $data = $request->validate([
            'title' => 'nullable|string|max:255',
            'document' => 'required|array',
        ]);
        $tid = (int) $request->user()->tenant_id;
        $row = BuilderTemplate::preferred($tid, $kind) ?? new BuilderTemplate([
            'tenant_id' => $tid,
            'kind' => $kind,
            'slug' => $kind,
            'is_default' => true,
            'priority' => 0,
        ]);
        $row->title = $data['title'] ?? $row->title;
        $row->draft = $this->document($data['document']);
        if (! $row->slug) {
            $row->slug = $kind;
        }
        $row->save();
        if (! $row->is_default) {
            $this->promoteDefault($row);
        }

        return response()->json(['data' => [
            'kind' => $row->kind,
            'title' => $row->title,
            'document' => $row->draft,
            'published_document' => $row->published,
        ]]);
    }

    public function publishTemplate(Request $request, string $kind): JsonResponse
    {
        $kind = $this->kind($kind);
        $row = BuilderTemplate::preferred((int) $request->user()->tenant_id, $kind);
        abort_unless($row, 404);
        abort_if(! is_array($row->draft), 422, 'draft missing');
        $row->published = $row->draft;
        $row->save();

        return response()->json(['data' => [
            'kind' => $row->kind,
            'title' => $row->title,
            'document' => $row->draft,
            'published_document' => $row->published,
        ]]);
    }

    private function page(Request $request, int $page): CmsPage
    {
        return CmsPage::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($page);
    }

    private function kind(string $kind): string
    {
        abort_unless(in_array($kind, ['header', 'footer'], true), 404);

        return $kind;
    }

    private function slug(?string $slug, string $title): string
    {
        $raw = trim((string) $slug);
        if ($raw === '') {
            $raw = Str::slug($title);
        }
        $raw = Str::slug($raw, '-');

        return $raw !== '' ? $raw : 'page-'.Str::lower(Str::random(4));
    }

    /** @param  array<string, mixed>|null  $document */
    private function document(?array $document): array
    {
        return BuilderDocumentRules::normalize($document);
    }

    private function promoteDefault(BuilderTemplate $row): void
    {
        DB::transaction(function () use ($row) {
            BuilderTemplate::query()
                ->where('tenant_id', $row->tenant_id)
                ->where('kind', $row->kind)
                ->where('id', '!=', $row->id)
                ->update(['is_default' => false]);
            $row->is_default = true;
            $row->save();
        });
    }

    /** @return array<string, mixed> */
    private function metaDocument(object $row, string $title, string $slug, string $status): array
    {
        $meta = is_array($row->meta ?? null) ? $row->meta : [];

        return [
            'id' => $row->id,
            'title' => $title,
            'slug' => $slug,
            'status' => $status,
            'document' => $meta['builder_document'] ?? ['version' => 1, 'sections' => []],
            'published_document' => $meta['builder_published'] ?? null,
        ];
    }

    /** @return array<string, mixed> */
    private function columnDocument(object $row, string $draftKey, string $publishedKey): array
    {
        return [
            'id' => $row->id,
            'title' => (string) ($row->title ?? ''),
            'slug' => (string) ($row->slug ?? ''),
            'status' => (string) ($row->status ?? 'draft'),
            'document' => $row->{$draftKey} ?? ['version' => 1, 'sections' => []],
            'published_document' => $row->{$publishedKey} ?? null,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeList(CmsPage $page): array
    {
        return [
            'id' => $page->id,
            'title' => $page->title,
            'slug' => $page->slug,
            'status' => $page->status ?: ($page->published ? 'published' : 'draft'),
            'has_draft' => is_array($page->builder_draft),
            'has_published' => is_array($page->builder_published),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeDetail(CmsPage $page): array
    {
        return [
            ...$this->serializeList($page),
            'document' => $page->builder_draft ?? ['version' => 1, 'sections' => []],
            'published_document' => $page->builder_published,
        ];
    }

    /** @return array<string, mixed> */
    private function templateSummary(?BuilderTemplate $row): array
    {
        return [
            'title' => $row?->title,
            'has_draft' => is_array($row?->draft),
            'has_published' => is_array($row?->published),
        ];
    }
}
