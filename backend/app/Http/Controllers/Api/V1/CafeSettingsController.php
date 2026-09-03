<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;

class CafeSettingsController extends Controller
{
    public function showMenu(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        return response()->json([
            'data' => $settings->get($tenantId, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults()),
        ]);
    }

    public function updateMenu(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'default_view' => ['required', 'string', 'in:grid,list'],
            'show_search' => ['required', 'boolean'],
            'show_category_bar' => ['required', 'boolean'],
            'show_new_badge' => ['required', 'boolean'],
            'header_cta_label_fa' => ['nullable', 'string', 'max:255'],
            'header_cta_label_en' => ['nullable', 'string', 'max:255'],
            'header_cta_url' => ['nullable', 'string', 'max:2048'],
            'placeholder_logo_text_fa' => ['nullable', 'string', 'max:255'],
            'placeholder_logo_text_en' => ['nullable', 'string', 'max:255'],
        ]);

        $tenantId = $request->user()->tenant_id;
        $merged = array_merge(ModuleSettingsService::cafeMenuDefaults(), $data);

        return response()->json([
            'data' => $settings->put($tenantId, 'cafe', 'menu', $merged),
        ]);
    }

    public function showHours(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        return response()->json([
            'data' => $settings->get($tenantId, 'cafe', 'hours', ModuleSettingsService::cafeHoursDefaults()),
        ]);
    }

    public function updateHours(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'timezone' => ['nullable', 'string', 'max:64'],
            'days' => ['required', 'array'],
            'days.*.day' => ['required', 'string', 'max:16'],
            'days.*.open' => ['nullable', 'string', 'max:8'],
            'days.*.close' => ['nullable', 'string', 'max:8'],
            'days.*.closed' => ['nullable', 'boolean'],
        ]);

        $tenantId = $request->user()->tenant_id;
        $merged = array_merge(ModuleSettingsService::cafeHoursDefaults(), $data);

        return response()->json([
            'data' => $settings->put($tenantId, 'cafe', 'hours', $merged),
        ]);
    }

    public function showGallery(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        return response()->json([
            'data' => $settings->get($tenantId, 'cafe', 'gallery', ModuleSettingsService::cafeGalleryDefaults()),
        ]);
    }

    public function updateGallery(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'images' => ['required', 'array'],
            'images.*.url' => ['required', 'string', 'max:2048'],
            'images.*.caption_fa' => ['nullable', 'string', 'max:255'],
            'images.*.caption_en' => ['nullable', 'string', 'max:255'],
            'images.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $tenantId = $request->user()->tenant_id;

        return response()->json([
            'data' => $settings->put($tenantId, 'cafe', 'gallery', $data),
        ]);
    }

    public function showVenue(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        return response()->json([
            'data' => $settings->get($tenantId, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults()),
        ]);
    }

    public function updateVenue(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'tagline_fa' => ['nullable', 'string', 'max:500'],
            'tagline_en' => ['nullable', 'string', 'max:500'],
            'about_fa' => ['nullable', 'string'],
            'about_en' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:32'],
            'instagram' => ['nullable', 'string', 'max:255'],
            'address_fa' => ['nullable', 'string', 'max:500'],
            'address_en' => ['nullable', 'string', 'max:500'],
            'map_url' => ['nullable', 'string', 'max:2048'],
            'mini_site_enabled' => ['required', 'boolean'],
        ]);

        $tenantId = $request->user()->tenant_id;
        $merged = array_merge(ModuleSettingsService::cafeVenueDefaults(), $data);

        return response()->json([
            'data' => $settings->put($tenantId, 'cafe', 'venue', $merged),
        ]);
    }

    public function showEngagement(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        return response()->json([
            'data' => $settings->get($tenantId, 'cafe', 'engagement', ModuleSettingsService::cafeEngagementDefaults()),
        ]);
    }

    public function updateEngagement(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'phone_gate_enabled' => ['required', 'boolean'],
            'likes_enabled' => ['required', 'boolean'],
            'feedback_enabled' => ['required', 'boolean'],
            'share_whatsapp_enabled' => ['required', 'boolean'],
            'share_telegram_enabled' => ['required', 'boolean'],
        ]);

        $tenantId = $request->user()->tenant_id;
        $merged = array_merge(ModuleSettingsService::cafeEngagementDefaults(), $data);

        return response()->json([
            'data' => $settings->put($tenantId, 'cafe', 'engagement', $merged),
        ]);
    }
}
