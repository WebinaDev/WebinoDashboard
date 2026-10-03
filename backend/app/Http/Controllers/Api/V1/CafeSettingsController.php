<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
            'default_view' => ['required', 'string', 'in:grid,list,cover'],
            'show_search' => ['required', 'boolean'],
            'show_category_bar' => ['required', 'boolean'],
            'show_new_badge' => ['required', 'boolean'],
            'header_cta_label_fa' => ['nullable', 'string', 'max:255'],
            'header_cta_label_en' => ['nullable', 'string', 'max:255'],
            'header_cta_url' => ['nullable', 'string', 'max:2048'],
            'placeholder_logo_text_fa' => ['nullable', 'string', 'max:255'],
            'placeholder_logo_text_en' => ['nullable', 'string', 'max:255'],
            'accent_color' => ['nullable', 'string', 'max:16'],
            'seasonal_theme' => ['nullable', 'string', 'in:none,nowruz,yalda,ramadan,summer'],
            'font_preset' => ['nullable', 'string', 'in:sans,serif,display'],
            'teaser_video_url' => ['nullable', 'string', 'max:2048'],
            'packaging_fee_minor' => ['nullable', 'integer', 'min:0'],
            'delivery_fee_minor' => ['nullable', 'integer', 'min:0'],
            'free_delivery_threshold_minor' => ['nullable', 'integer', 'min:0'],
            'prep_minutes' => ['nullable', 'integer', 'min:0', 'max:240'],
            'max_orders_per_day' => ['nullable', 'integer', 'min:0', 'max:5000'],
            'block_orders_when_closed' => ['nullable', 'boolean'],
            'fulfillment_dine_in' => ['nullable', 'boolean'],
            'fulfillment_pickup' => ['nullable', 'boolean'],
            'fulfillment_delivery' => ['nullable', 'boolean'],
        ]);

        $tenantId = $request->user()->tenant_id;
        $current = $settings->get($tenantId, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults());
        $merged = array_merge(ModuleSettingsService::cafeMenuDefaults(), is_array($current) ? $current : [], $data);

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
            'closed_dates' => ['nullable', 'array', 'max:60'],
            'closed_dates.*' => ['date_format:Y-m-d'],
        ]);

        $tenantId = $request->user()->tenant_id;
        $current = $settings->get($tenantId, 'cafe', 'hours', ModuleSettingsService::cafeHoursDefaults());
        $merged = array_merge(ModuleSettingsService::cafeHoursDefaults(), is_array($current) ? $current : [], $data);

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
            'whatsapp_url' => ['nullable', 'string', 'max:2048'],
            'telegram_url' => ['nullable', 'string', 'max:2048'],
            'bill_pay_url' => ['nullable', 'string', 'max:2048'],
        ]);

        $tenantId = $request->user()->tenant_id;
        $current = $settings->get($tenantId, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults());
        $merged = array_merge(ModuleSettingsService::cafeVenueDefaults(), is_array($current) ? $current : [], $data);

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

    public function bulkPrice(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'product_ids' => ['required', 'array', 'min:1', 'max:200'],
            'product_ids.*' => ['integer'],
            'percent' => ['required', 'integer', 'min:-90', 'max:400'],
        ]);

        $updated = 0;
        DB::transaction(function () use ($tid, $data, &$updated) {
            $products = Product::query()
                ->where('tenant_id', $tid)
                ->whereIn('id', $data['product_ids'])
                ->where(function ($q) { $q->where('lock_price', false)->orWhereNull('lock_price'); })
                ->get();
            foreach ($products as $product) {
                $next = (int) round(((int) $product->price_minor) * (100 + (int) $data['percent']) / 100);
                $product->price_minor = max(0, $next);
                $product->save();
                $updated++;
            }
        });

        return response()->json(['data' => ['updated' => $updated]]);
    }
}
