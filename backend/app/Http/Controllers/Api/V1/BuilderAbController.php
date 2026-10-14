<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\BuilderAbTest;
use App\Models\CmsPage;
use App\Services\Builder\BuilderAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

/** A/B tests between two builder pages: admin setup/results and public view/conversion events. */
class BuilderAbController extends Controller
{
    use ResolvesPublicTenant;

    public function show(Request $request, int $page): JsonResponse
    {
        $row = $this->page($request, $page);
        $test = BuilderAbTest::query()->where('tenant_id', $row->tenant_id)->where('page_id', $row->id)->first();

        return response()->json(['data' => $test ? $this->result($test) : null]);
    }

    public function update(Request $request, int $page): JsonResponse
    {
        BuilderAccess::authorize($request, 'publish');
        $row = $this->page($request, $page);
        $data = $request->validate([
            'variant_page_id' => 'required|integer',
            'split' => 'required|integer|min:5|max:95',
            'status' => 'required|in:running,paused',
            'reset' => 'nullable|boolean',
        ]);
        abort_if((int) $data['variant_page_id'] === $row->id, 422, 'variant must be another page');
        CmsPage::query()->where('tenant_id', $row->tenant_id)->findOrFail($data['variant_page_id']);
        $test = BuilderAbTest::query()->firstOrNew(['tenant_id' => $row->tenant_id, 'page_id' => $row->id]);
        $changed = $test->exists && (int) $test->variant_page_id !== (int) $data['variant_page_id'];
        $test->fill(['variant_page_id' => $data['variant_page_id'], 'split' => $data['split'], 'status' => $data['status']]);
        if ($changed || ! empty($data['reset'])) {
            $test->fill(['views_a' => 0, 'views_b' => 0, 'conversions_a' => 0, 'conversions_b' => 0]);
        }
        $test->save();

        return response()->json(['data' => $this->result($test)]);
    }

    public function destroy(Request $request, int $page): JsonResponse
    {
        BuilderAccess::authorize($request, 'publish');
        $row = $this->page($request, $page);
        BuilderAbTest::query()->where('tenant_id', $row->tenant_id)->where('page_id', $row->id)->delete();

        return response()->json(['data' => null]);
    }

    public function event(Request $request, int $test): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate(['variant' => 'required|in:a,b', 'type' => 'required|in:view,conversion']);
        $key = "builder_ab:$tid:$test:".$request->ip().':'.$data['type'];
        if (RateLimiter::tooManyAttempts($key, 30)) {
            return response()->json(['data' => ['ok' => true]]);
        }
        RateLimiter::hit($key, 3600);
        $row = BuilderAbTest::query()->where('tenant_id', $tid)->where('status', 'running')->find($test);
        if ($row) {
            $column = ($data['type'] === 'view' ? 'views_' : 'conversions_').$data['variant'];
            BuilderAbTest::query()->whereKey($row->id)->increment($column);
        }

        return response()->json(['data' => ['ok' => true]]);
    }

    /** Public payload for a page: the running test with the published variant document, or null. */
    public static function publicPayload(CmsPage $page): ?array
    {
        $test = BuilderAbTest::query()->where('tenant_id', $page->tenant_id)->where('page_id', $page->id)->where('status', 'running')->first();
        if (! $test) {
            return null;
        }
        $variant = CmsPage::query()->where('tenant_id', $page->tenant_id)->find($test->variant_page_id);
        if (! $variant || ! is_array($variant->builder_published)) {
            return null;
        }

        return ['id' => $test->id, 'split' => $test->split, 'variant' => ['slug' => $variant->slug, 'document' => $variant->builder_published]];
    }

    /** @return array<string, mixed> */
    private function result(BuilderAbTest $t): array
    {
        $rateA = $t->views_a ? $t->conversions_a / $t->views_a : 0.0;
        $rateB = $t->views_b ? $t->conversions_b / $t->views_b : 0.0;
        // Two-proportion z-test; |z| >= 1.96 ≈ 95% confidence.
        $n = $t->views_a + $t->views_b;
        $pooled = $n ? ($t->conversions_a + $t->conversions_b) / $n : 0;
        $se = ($t->views_a && $t->views_b) ? sqrt($pooled * (1 - $pooled) * (1 / $t->views_a + 1 / $t->views_b)) : 0;
        $z = $se > 0 ? ($rateB - $rateA) / $se : 0.0;

        return [
            'id' => $t->id,
            'variant_page_id' => $t->variant_page_id,
            'split' => $t->split,
            'status' => $t->status,
            'views_a' => $t->views_a,
            'views_b' => $t->views_b,
            'conversions_a' => $t->conversions_a,
            'conversions_b' => $t->conversions_b,
            'rate_a' => round($rateA * 100, 2),
            'rate_b' => round($rateB * 100, 2),
            'z' => round($z, 2),
            'significant' => abs($z) >= 1.96 && min($t->views_a, $t->views_b) >= 100,
        ];
    }

    private function page(Request $request, int $page): CmsPage
    {
        return CmsPage::query()->where('tenant_id', $request->user()->tenant_id)->findOrFail($page);
    }
}
