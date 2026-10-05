<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Performance\PerformanceSettingsService;
use Illuminate\Http\Request;

class PerformanceSettingsController extends Controller
{
    public function show(Request $request, PerformanceSettingsService $perf): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $perf->get((int) $request->user()->tenant_id)]);
    }

    public function update(Request $request, PerformanceSettingsService $perf): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'webp_enabled' => ['sometimes', 'boolean'],
            'lazy_load' => ['sometimes', 'boolean'],
            'minify_inline_css' => ['sometimes', 'boolean'],
            'purge_on_product_save' => ['sometimes', 'boolean'],
            'purge_on_content_save' => ['sometimes', 'boolean'],
            'isr_revalidate_seconds' => ['sometimes', 'integer', 'min:0', 'max:86400'],
            'cdn_cache_hint' => ['sometimes', 'boolean'],
            'preload_fonts' => ['sometimes', 'boolean'],
            'defer_analytics' => ['sometimes', 'boolean'],
            'image_quality' => ['sometimes', 'integer', 'min:40', 'max:100'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return response()->json(['data' => $perf->save((int) $request->user()->tenant_id, $data)]);
    }

    public function purge(Request $request, PerformanceSettingsService $perf): \Illuminate\Http\JsonResponse
    {
        $reason = (string) $request->input('reason', 'manual');

        return response()->json(['data' => $perf->purge((int) $request->user()->tenant_id, $reason)]);
    }
}
