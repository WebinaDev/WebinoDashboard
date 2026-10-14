<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CmsPage;
use App\Services\Builder\BuilderAccess;
use App\Services\Builder\BuilderPageLifecycle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** Page SEO / language / schedule / unpublish / discard / preview link / edit lock for builder pages. */
class BuilderPageSettingsController extends Controller
{
    public const LANGS = ['fa', 'en', 'ar', 'tr', 'ku', 'az'];

    public function __construct(private BuilderPageLifecycle $life) {}

    public function show(Request $request, int $page): JsonResponse
    {
        return response()->json(['data' => $this->payload($request, $this->page($request, $page))]);
    }

    public function update(Request $request, int $page): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $row = $this->page($request, $page);
        $this->guardLock($request, $row);
        $data = $request->validate([
            'seo' => 'sometimes|array',
            'seo.seo_title' => 'nullable|string|max:120',
            'seo.seo_description' => 'nullable|string|max:320',
            'seo.seo_keyword' => 'nullable|string|max:80',
            'seo.noindex' => 'nullable|boolean',
            'seo.canonical' => 'nullable|string|max:500|starts_with:https://',
            'seo.seo_og_title' => 'nullable|string|max:120',
            'seo.seo_og_image' => 'nullable|string|max:500',
            'seo.schema_type' => 'nullable|in:WebPage,AboutPage,ContactPage,FAQPage,CollectionPage,Article',
            'seo.breadcrumb' => 'nullable|boolean',
            'lang' => 'sometimes|nullable|in:'.implode(',', self::LANGS),
            'translation_of' => 'sometimes|nullable|integer',
        ]);
        if (array_key_exists('seo', $data)) {
            $seo = array_map(fn ($v) => is_string($v) ? trim(strip_tags($v)) : $v, $data['seo']);
            if (! empty($seo['seo_og_image']) && ! preg_match('#^(https://|/(?!/))[^\s"<>]+$#', $seo['seo_og_image'])) {
                abort(422, 'og image must be https or site-relative');
            }
            if (! empty($seo['canonical']) && preg_match('#[\s"<>]#', $seo['canonical'])) {
                abort(422, 'invalid canonical');
            }
            $seo['seo_robots'] = ! empty($seo['noindex']) ? 'noindex,follow' : null;
            $row->seo = array_merge(is_array($row->seo) ? $row->seo : [], $seo);
        }
        if (array_key_exists('lang', $data)) {
            $row->lang = $data['lang'];
        }
        if (array_key_exists('translation_of', $data)) {
            if ($data['translation_of']) {
                $source = CmsPage::query()->where('tenant_id', $row->tenant_id)->where('id', '!=', $row->id)->findOrFail($data['translation_of']);
                if (! $source->translation_group) {
                    $source->translation_group = (string) Str::uuid();
                    $source->save();
                }
                $row->translation_group = $source->translation_group;
            } else {
                $row->translation_group = null;
            }
        }
        $row->save();

        return response()->json(['data' => $this->payload($request, $row)]);
    }

    public function schedule(Request $request, int $page): JsonResponse
    {
        BuilderAccess::authorize($request, 'publish');
        $row = $this->page($request, $page);
        $data = $request->validate([
            'publish_at' => 'nullable|date|after:now',
            'unpublish_at' => 'nullable|date|after:now',
        ]);
        if (! empty($data['publish_at']) && ! empty($data['unpublish_at'])) {
            abort_unless(strtotime($data['unpublish_at']) > strtotime($data['publish_at']), 422, 'unpublish must be after publish');
        }
        $row->builder_publish_at = $data['publish_at'] ?? null;
        $row->builder_unpublish_at = $data['unpublish_at'] ?? null;
        $row->save();

        return response()->json(['data' => $this->payload($request, $row)]);
    }

    public function unpublish(Request $request, int $page): JsonResponse
    {
        BuilderAccess::authorize($request, 'publish');
        $row = $this->page($request, $page);
        $this->life->unpublish($row);

        return response()->json(['data' => $this->payload($request, $row)]);
    }

    public function discard(Request $request, int $page): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $row = $this->page($request, $page);
        $this->guardLock($request, $row);
        abort_unless(is_array($row->builder_published), 422, 'nothing published');
        $row->builder_draft = $row->builder_published;
        $row->save();

        return response()->json(['data' => [...$this->payload($request, $row), 'document' => $row->builder_draft]]);
    }

    public function previewToken(Request $request, int $page): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');

        return response()->json(['data' => $this->life->issuePreviewToken($this->page($request, $page))]);
    }

    public function lock(Request $request, int $page): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $row = $this->page($request, $page);
        $other = $this->life->lockedByOther($row, $request->user());
        if ($other && ! $request->boolean('takeover')) {
            return response()->json(['message' => 'locked', 'data' => ['locked_by' => $other]], 423);
        }

        return response()->json(['data' => ['lock' => $this->life->lock($row, $request->user())]]);
    }

    public function unlock(Request $request, int $page): JsonResponse
    {
        $this->life->unlock($this->page($request, $page), $request->user());

        return response()->json(['data' => ['ok' => true]]);
    }

    private function guardLock(Request $request, CmsPage $row): void
    {
        $other = $this->life->lockedByOther($row, $request->user());
        abort_if($other !== null, 423, 'locked by '.($other['name'] ?? ''));
    }

    private function page(Request $request, int $page): CmsPage
    {
        return CmsPage::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($page);
    }

    /** @return array<string, mixed> */
    private function payload(Request $request, CmsPage $row): array
    {
        $translations = $row->translation_group
            ? CmsPage::query()->where('tenant_id', $row->tenant_id)->where('translation_group', $row->translation_group)->where('id', '!=', $row->id)
                ->get(['id', 'title', 'slug', 'lang'])->map(fn ($p) => ['id' => $p->id, 'title' => $p->title, 'slug' => $p->slug, 'lang' => $p->lang])->values()
            : [];

        return [
            'id' => $row->id,
            'slug' => $row->slug,
            'status' => $row->status ?: ($row->published ? 'published' : 'draft'),
            'published' => (bool) $row->published,
            'has_published' => is_array($row->builder_published),
            'seo' => is_array($row->seo) ? $row->seo : (object) [],
            'lang' => $row->lang,
            'translations' => $translations,
            'publish_at' => $row->builder_publish_at?->toIso8601String(),
            'unpublish_at' => $row->builder_unpublish_at?->toIso8601String(),
            'lock' => $this->life->activeLock($row),
            'abilities' => BuilderAccess::abilities($request->user()),
        ];
    }
}
