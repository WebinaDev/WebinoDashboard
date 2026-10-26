<?php

namespace App\Http\Controllers\Api\V1\Resume;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use App\Models\Tenant;
use App\Services\Resume\ResumeSchema;
use App\Services\Resume\ResumeScope;
use App\Services\Resume\ResumeThemes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /public/resume/full[?key=<private_token>] — every section in one payload for the resume.* builder widgets.
 * Public rows only (plus private_link rows when the key matches); both languages are returned, widgets pick by page lang.
 */
class PublicResumeFullController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $settingsRow = ResumeSchema::model('settings')::query()->first();
        $key = (string) $request->query('key', '');
        $withPrivate = $settingsRow && $settingsRow->private_token && hash_equals((string) $settingsRow->private_token, $key);
        $out = [];
        $mediaIds = [];
        foreach (ResumeSchema::sections() as $slug => $s) {
            $class = ResumeSchema::model($slug);
            if ($s['single'] ?? false) {
                $row = $class::query()->first();
                $out[$slug] = $row ? ResumeSchema::present($slug, $row) : null;
            } else {
                $q = $class::query()->orderBy('order')->orderBy('id');
                $q->whereIn('visibility', $withPrivate ? ['public', 'private_link'] : ['public']);
                $out[$slug] = $q->get()->map(fn ($r) => ResumeSchema::present($slug, $r))->all();
            }
            foreach ($s['fields'] as $f) {
                if (in_array($f['type'], ['media', 'media_list'], true)) {
                    foreach ((array) ($out[$slug] ?? []) as $item) {
                        foreach ([$item] as $it) {
                            if (! is_array($it)) {
                                continue;
                            }
                            foreach ((array) ($it[$f['key']] ?? []) as $id) {
                                $mediaIds[] = (int) $id;
                            }
                        }
                    }
                    if ($s['single'] ?? false) {
                        foreach ((array) ($out[$slug][$f['key']] ?? []) as $id) {
                            $mediaIds[] = (int) $id;
                        }
                    }
                }
            }
        }
        $tenant = Tenant::query()->find(ResumeScope::id());
        $out['settings'] ??= ['theme_key' => 'code-noir', 'mode' => 'system', 'date_calendar' => 'auto', 'languages' => ['fa', 'en']];
        $out['settings']['default_lang'] = $out['settings']['default_lang'] ?? ($tenant?->default_locale ?: 'fa');
        $out['theme'] = ResumeThemes::catalog()[$out['settings']['theme_key'] ?? 'code-noir'] ?? null;
        $ids = array_values(array_unique(array_filter($mediaIds)));
        $out['media'] = $ids ? MediaAsset::query()->where('tenant_id', ResumeScope::id())->whereIn('id', $ids)->get()
            ->mapWithKeys(fn ($m) => [$m->id => ['url' => $m->url, 'mime' => $m->mime ?? null]])->all() : (object) [];

        return response()->json(['data' => $out]);
    }
}
