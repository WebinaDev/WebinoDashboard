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
            'enabled' => ['sometimes', 'boolean'],
            'preset' => ['sometimes', 'string', 'in:beginner,recommended,aggressive,custom'],

            'page_cache_enabled' => ['sometimes', 'boolean'],
            'page_cache_driver' => ['sometimes', 'string', 'in:file,redis,memcached'],
            'cache_separate_guests' => ['sometimes', 'boolean'],
            'cache_by_device' => ['sometimes', 'boolean'],
            'cache_query_string' => ['sometimes', 'boolean'],
            'purge_on_product_save' => ['sometimes', 'boolean'],
            'purge_on_content_save' => ['sometimes', 'boolean'],
            'preload_cache' => ['sometimes', 'boolean'],
            'object_cache_enabled' => ['sometimes', 'boolean'],
            'browser_cache_enabled' => ['sometimes', 'boolean'],
            'browser_cache_ttl' => ['sometimes', 'integer', 'min:0', 'max:31536000'],
            'cache_busting' => ['sometimes', 'boolean'],
            'cdn_cache_hint' => ['sometimes', 'boolean'],
            'cdn_cache_control' => ['sometimes', 'nullable', 'string', 'max:255'],
            'surrogate_control' => ['sometimes', 'nullable', 'string', 'max:255'],

            'minify_html' => ['sometimes', 'boolean'],
            'minify_css' => ['sometimes', 'boolean'],
            'minify_js' => ['sometimes', 'boolean'],
            'minify_inline_css' => ['sometimes', 'boolean'],
            'defer_js' => ['sometimes', 'boolean'],
            'delay_js' => ['sometimes', 'boolean'],
            'remove_unused_css' => ['sometimes', 'boolean'],
            'critical_css' => ['sometimes', 'boolean'],
            'combine_css' => ['sometimes', 'boolean'],
            'combine_js' => ['sometimes', 'boolean'],

            'webp_enabled' => ['sometimes', 'boolean'],
            'avif_enabled' => ['sometimes', 'boolean'],
            'lazy_load' => ['sometimes', 'boolean'],
            'responsive_images' => ['sometimes', 'boolean'],
            'image_quality' => ['sometimes', 'integer', 'min:40', 'max:100'],
            'strip_image_meta' => ['sometimes', 'boolean'],
            'cdn_image_optimization' => ['sometimes', 'boolean'],
            'preload_lcp_image' => ['sometimes', 'boolean'],
            'retina_images' => ['sometimes', 'boolean'],

            'preload_fonts' => ['sometimes', 'boolean'],
            'font_display' => ['sometimes', 'string', 'in:swap,optional,fallback,block'],
            'self_host_fonts' => ['sometimes', 'boolean'],
            'reduce_font_weights' => ['sometimes', 'boolean'],

            'preload_critical' => ['sometimes', 'boolean'],
            'prefetch_next' => ['sometimes', 'boolean'],
            'preconnect_third_party' => ['sometimes', 'boolean'],
            'fetchpriority_lcp' => ['sometimes', 'boolean'],

            'brotli_gzip' => ['sometimes', 'boolean'],
            'compression_level' => ['sometimes', 'integer', 'min:1', 'max:11'],

            'defer_analytics' => ['sometimes', 'boolean'],
            'delay_third_party' => ['sometimes', 'boolean'],
            'third_party_facades' => ['sometimes', 'boolean'],

            'cdn_provider' => ['sometimes', 'string', 'in:auto,none,cloudflare,arvan,parspack,custom'],
            'cdn_zone' => ['sometimes', 'nullable', 'string', 'max:255'],
            'cdn_api_token' => ['sometimes', 'nullable', 'string', 'max:512'],
            'cdn_early_hints' => ['sometimes', 'boolean'],
            'cdn_mobile_desktop_rules' => ['sometimes', 'boolean'],

            'db_cleanup_enabled' => ['sometimes', 'boolean'],
            'db_cleanup_schedule' => ['sometimes', 'string', 'in:daily,weekly,monthly,manual'],
            'db_tips_enabled' => ['sometimes', 'boolean'],

            'score_monitoring' => ['sometimes', 'boolean'],
            'alert_on_drop' => ['sometimes', 'boolean'],
            'isr_revalidate_seconds' => ['sometimes', 'integer', 'min:0', 'max:86400'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return response()->json(['data' => $perf->save((int) $request->user()->tenant_id, $data)]);
    }

    public function purge(Request $request, PerformanceSettingsService $perf): \Illuminate\Http\JsonResponse
    {
        $reason = (string) $request->input('reason', 'manual');

        return response()->json(['data' => $perf->purge((int) $request->user()->tenant_id, $reason)]);
    }

    public function insights(Request $request, PerformanceSettingsService $perf): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $perf->insights((int) $request->user()->tenant_id)]);
    }
}
