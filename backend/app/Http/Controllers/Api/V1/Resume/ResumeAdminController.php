<?php

namespace App\Http\Controllers\Api\V1\Resume;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use App\Services\Resume\ResumeImporter;
use App\Services\Resume\ResumeSchema;
use App\Services\Resume\ResumeScope;
use App\Services\Resume\ResumeThemes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Dashboard API for the Resume module. Every section is its own entity:
 *   list sections  GET/POST /resume/{section}, PUT/DELETE /resume/{section}/{id}, POST /resume/{section}/reorder
 *   single sections (profile, about, settings) GET/PUT /resume/{section}
 */
class ResumeAdminController extends Controller
{
    public function schema(): JsonResponse
    {
        return response()->json(['data' => ResumeSchema::all()]);
    }

    /** Counts per section for the «رزومه» overview page. */
    public function overview(): JsonResponse
    {
        $out = [];
        foreach (ResumeSchema::sections() as $slug => $s) {
            $q = ResumeSchema::model($slug)::query();
            $out[$slug] = ['count' => $q->count(), 'placeholders' => (clone $q)->where('is_placeholder', true)->count()];
        }

        return response()->json(['data' => $out]);
    }

    public function index(string $section): JsonResponse
    {
        if (ResumeSchema::isSingle($section)) {
            return $this->showSingle($section);
        }
        $rows = ResumeSchema::model($section)::query()->orderBy('order')->orderBy('id')->get();

        return response()->json(['data' => $rows->map(fn ($r) => ResumeSchema::present($section, $r, true))->all()]);
    }

    public function store(Request $request, string $section): JsonResponse
    {
        abort_if(ResumeSchema::isSingle($section), 405);
        $data = $this->validated($request, $section, false);
        $class = ResumeSchema::model($section);
        $data['order'] ??= ((int) $class::query()->max('order')) + 1;
        $row = $class::query()->create($data);

        return response()->json(['data' => ResumeSchema::present($section, $row, true)], 201);
    }

    public function update(Request $request, string $section, int $id): JsonResponse
    {
        abort_if(ResumeSchema::isSingle($section), 405);
        $row = ResumeSchema::model($section)::query()->findOrFail($id);
        $row->update($this->validated($request, $section, true));

        return response()->json(['data' => ResumeSchema::present($section, $row->fresh(), true)]);
    }

    public function destroy(string $section, int $id): JsonResponse
    {
        abort_if(ResumeSchema::isSingle($section), 405);
        ResumeSchema::model($section)::query()->findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }

    /** Body: {ids: [3,1,2]} — the new order of the whole list. */
    public function reorder(Request $request, string $section): JsonResponse
    {
        abort_if(ResumeSchema::isSingle($section), 405);
        $ids = $request->validate(['ids' => ['required', 'array', 'max:500'], 'ids.*' => ['integer']])['ids'];
        $class = ResumeSchema::model($section);
        DB::transaction(function () use ($class, $ids) {
            foreach (array_values($ids) as $i => $id) {
                $class::query()->whereKey($id)->update(['order' => $i]);
            }
        });

        return $this->index($section);
    }

    public function showSingle(string $section): JsonResponse
    {
        abort_unless(ResumeSchema::isSingle($section), 404);
        $row = ResumeSchema::model($section)::query()->firstOrCreate(['tenant_id' => ResumeScope::id()], $this->singleDefaults($section));

        return response()->json(['data' => ResumeSchema::present($section, $row, true)]);
    }

    public function updateSingle(Request $request, string $section): JsonResponse
    {
        abort_unless(ResumeSchema::isSingle($section), 404);
        $data = $this->validated($request, $section, true);
        $row = ResumeSchema::model($section)::query()->firstOrCreate(['tenant_id' => ResumeScope::id()], $this->singleDefaults($section));
        $row->update($data);

        return response()->json(['data' => ResumeSchema::present($section, $row->fresh(), true)]);
    }

    /** POST /resume/import — body = data.json shape (see docs/resume/README.md). ?replace=1 wipes sections first. */
    public function import(Request $request): JsonResponse
    {
        $report = ResumeImporter::import(ResumeScope::id(), $request->json()->all(), (bool) $request->boolean('replace'));

        return response()->json(['data' => $report]);
    }

    public function themes(): JsonResponse
    {
        return response()->json(['data' => ResumeThemes::catalog()]);
    }

    /** POST /resume/theme/apply {theme_key, langs?: ["fa","en"]} — rewrites the resume pages with the theme's layout preset (previous builder document kept as a revision). */
    public function applyTheme(Request $request): JsonResponse
    {
        $data = $request->validate([
            'theme_key' => ['required', 'string', 'in:'.implode(',', array_keys(ResumeThemes::catalog()))],
            'langs' => ['sometimes', 'array'], 'langs.*' => ['in:fa,en'],
        ]);

        return response()->json(['data' => ResumeThemes::applyLayout(ResumeScope::id(), $data['theme_key'], $data['langs'] ?? ['fa', 'en'])]);
    }

    private function singleDefaults(string $section): array
    {
        return $section === 'settings'
            ? ['theme_key' => 'code-noir', 'mode' => 'system', 'date_calendar' => 'auto', 'languages' => ['fa', 'en'], 'default_lang' => 'fa']
            : [];
    }

    private function validated(Request $request, string $section, bool $partial): array
    {
        $data = $request->validate(ResumeSchema::rules($section, $partial));
        $this->assertTenantMedia($section, $data);

        return ResumeSchema::normalize($section, $data);
    }

    /** media/media_list fields may only point at this tenant's media library. */
    private function assertTenantMedia(string $section, array $data): void
    {
        $ids = [];
        foreach (ResumeSchema::section($section)['fields'] as $f) {
            if (in_array($f['type'], ['media', 'media_list'], true)) {
                foreach (ResumeSchema::columns($f) as $c) {
                    foreach ((array) ($data[$c] ?? []) as $id) {
                        $ids[(int) $id] = $c;
                    }
                }
            }
        }
        if (! $ids) {
            return;
        }
        $found = MediaAsset::query()->where('tenant_id', ResumeScope::id())->whereIn('id', array_keys($ids))->pluck('id')->all();
        $missing = array_diff(array_keys($ids), array_map('intval', $found));
        if ($missing) {
            throw ValidationException::withMessages([$ids[reset($missing)] => ['رسانه انتخاب‌شده در کتابخانه این سایت نیست.']]);
        }
    }
}
