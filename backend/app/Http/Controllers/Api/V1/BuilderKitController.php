<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BuilderGlobal;
use App\Models\BuilderLibraryItem;
use App\Models\BuilderTemplate;
use App\Models\CmsPage;
use App\Services\Builder\BuilderAccess;
use App\Services\Builder\BuilderDocumentRules;
use App\Services\Builder\BuilderGlobalsNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Site kit: export/import globals, theme templates, saved blocks and builder pages as one JSON file. */
class BuilderKitController extends Controller
{
    private const FORMAT = 'webino-kit';

    public function export(Request $request): JsonResponse
    {
        BuilderAccess::authorize($request, 'design');
        $tid = (int) $request->user()->tenant_id;
        $globals = BuilderGlobal::query()->where('tenant_id', $tid)->first();

        return response()->json(['data' => [
            'format' => self::FORMAT,
            'version' => 1,
            'exported_at' => now()->toIso8601String(),
            'globals' => $globals?->draft ?? $globals?->published,
            'templates' => BuilderTemplate::query()->where('tenant_id', $tid)->orderBy('id')->get()
                ->map(fn (BuilderTemplate $t) => [
                    'kind' => $t->kind, 'title' => $t->title, 'priority' => $t->priority,
                    'conditions' => $t->conditions, 'is_default' => (bool) $t->is_default,
                    'document' => $t->draft ?? $t->published,
                ])->values(),
            'library' => BuilderLibraryItem::query()->where('tenant_id', $tid)->orderBy('id')->limit(200)->get()
                ->map(fn (BuilderLibraryItem $i) => ['kind' => $i->kind, 'title' => $i->title, 'category' => $i->category, 'document' => $i->document])->values(),
            'pages' => CmsPage::query()->where('tenant_id', $tid)->whereNotNull('builder_draft')
                ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'trash'))
                ->orderBy('id')->limit(200)->get()
                ->map(fn (CmsPage $p) => ['title' => $p->title, 'slug' => $p->slug, 'document' => $p->builder_draft])->values(),
        ]]);
    }

    public function import(Request $request): JsonResponse
    {
        BuilderAccess::authorize($request, 'design');
        abort_if(strlen($request->getContent()) > 8_000_000, 413, 'kit too large');
        $data = $request->validate([
            'kit' => 'required|array',
            'kit.format' => 'required|in:'.self::FORMAT,
            'parts' => 'nullable|array',
            'parts.*' => 'in:globals,templates,library,pages',
        ]);
        $kit = (array) $request->input('kit');
        $parts = $data['parts'] ?? ['globals', 'templates', 'library', 'pages'];
        $tid = (int) $request->user()->tenant_id;
        $counts = ['globals' => 0, 'templates' => 0, 'library' => 0, 'pages' => 0];

        DB::transaction(function () use ($kit, $parts, $tid, $request, &$counts) {
            if (in_array('globals', $parts, true) && is_array($kit['globals'] ?? null)) {
                BuilderGlobal::query()->updateOrCreate(['tenant_id' => $tid], ['draft' => app(BuilderGlobalsNormalizer::class)->normalize($kit['globals'])]);
                $counts['globals'] = 1;
            }
            if (in_array('templates', $parts, true)) {
                foreach (array_slice((array) ($kit['templates'] ?? []), 0, 100) as $t) {
                    if (! is_array($t) || ! is_string($t['kind'] ?? null) || ! preg_match('/^[a-z_]{2,40}$/', $t['kind'])) {
                        continue;
                    }
                    BuilderTemplate::query()->create([
                        'tenant_id' => $tid,
                        'kind' => $t['kind'],
                        'slug' => $t['kind'].'-'.Str::lower(Str::random(6)),
                        'title' => mb_substr(strip_tags((string) ($t['title'] ?? $t['kind'])), 0, 160),
                        'is_default' => ! empty($t['is_default']) && ! BuilderTemplate::query()->where('tenant_id', $tid)->where('kind', $t['kind'])->where('is_default', true)->exists(),
                        'priority' => (int) ($t['priority'] ?? 0),
                        'conditions' => is_array($t['conditions'] ?? null) ? $t['conditions'] : null,
                        'draft' => BuilderDocumentRules::normalize(is_array($t['document'] ?? null) ? $t['document'] : null),
                    ]);
                    $counts['templates']++;
                }
            }
            if (in_array('library', $parts, true)) {
                foreach (array_slice((array) ($kit['library'] ?? []), 0, 200) as $i) {
                    if (! is_array($i) || ! in_array($i['kind'] ?? null, ['section', 'page', 'widget'], true) || ! is_array($i['document'] ?? null)) {
                        continue;
                    }
                    BuilderLibraryItem::query()->create([
                        'tenant_id' => $tid,
                        'user_id' => $request->user()->id,
                        'kind' => $i['kind'],
                        'title' => mb_substr(strip_tags((string) ($i['title'] ?? 'بلوک')), 0, 160) ?: 'بلوک',
                        'category' => isset($i['category']) ? mb_substr(strip_tags((string) $i['category']), 0, 80) : null,
                        'document' => BuilderDocumentRules::normalize($i['document']),
                    ]);
                    $counts['library']++;
                }
            }
            if (in_array('pages', $parts, true)) {
                foreach (array_slice((array) ($kit['pages'] ?? []), 0, 200) as $p) {
                    if (! is_array($p) || ! is_array($p['document'] ?? null)) {
                        continue;
                    }
                    $title = mb_substr(strip_tags((string) ($p['title'] ?? 'صفحه')), 0, 255) ?: 'صفحه';
                    $slug = Str::slug((string) ($p['slug'] ?? '')) ?: 'page';
                    $base = $slug;
                    $n = 2;
                    while (CmsPage::query()->where('tenant_id', $tid)->where('slug', $slug)->exists()) {
                        $slug = $base.'-'.$n++;
                    }
                    CmsPage::query()->create([
                        'tenant_id' => $tid, 'title' => $title, 'slug' => $slug, 'body' => null,
                        'published' => false, 'status' => 'draft',
                        'builder_draft' => BuilderDocumentRules::normalize($p['document']),
                    ]);
                    $counts['pages']++;
                }
            }
        });

        return response()->json(['data' => ['imported' => $counts]]);
    }
}
