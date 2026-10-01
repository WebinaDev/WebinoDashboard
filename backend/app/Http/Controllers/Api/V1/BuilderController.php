<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BuilderTemplate;
use App\Models\CmsPage;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BuilderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $tenant = Tenant::query()->findOrFail($tid);
        $pages = CmsPage::query()->where('tenant_id', $tid)->orderBy('title')->get();
        $templates = BuilderTemplate::query()->where('tenant_id', $tid)->get()->keyBy('kind');

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

    public function destroy(Request $request, int $page): JsonResponse
    {
        $this->page($request, $page)->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function showTemplate(Request $request, string $kind): JsonResponse
    {
        $kind = $this->kind($kind);
        $row = BuilderTemplate::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('kind', $kind)
            ->first();

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
        $row = BuilderTemplate::query()->updateOrCreate(
            ['tenant_id' => $request->user()->tenant_id, 'kind' => $kind],
            [
                'title' => $data['title'] ?? null,
                'draft' => $this->document($data['document']),
            ],
        );

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
        $row = BuilderTemplate::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('kind', $kind)
            ->firstOrFail();
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
        $document ??= ['version' => 1, 'sections' => []];
        $json = json_encode($document);
        abort_if($json === false || strlen($json) > 750000, 422, 'document too large');
        if (! isset($document['version'])) {
            $document['version'] = 1;
        }
        if (! isset($document['sections']) || ! is_array($document['sections'])) {
            $document['sections'] = [];
        }

        return $document;
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
