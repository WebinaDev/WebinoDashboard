<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shipping\ShippingCarrierRegistry;
use App\Services\Shop\ProductNotificationSettings;
use App\Services\Shop\StorefrontAppearanceService;
use App\Services\Sms\SmsPanelAdapterRegistry;
use Illuminate\Http\Request;

class ShopExtrasAdminController extends Controller
{
    public function themeOptimizerShow(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $settings->get($tid, 'shop', 'theme_optimizer', [
            'webp_enabled' => true,
            'lazy_load' => true,
            'minify_inline_css' => false,
        ]);

        return response()->json(['data' => $data]);
    }

    public function themeOptimizerUpdate(Request $request, ModuleSettingsService $settings): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'webp_enabled' => ['sometimes', 'boolean'],
            'lazy_load' => ['sometimes', 'boolean'],
            'minify_inline_css' => ['sometimes', 'boolean'],
        ]);
        $merged = array_merge($settings->get($tid, 'shop', 'theme_optimizer', []), $data);
        $settings->put($tid, 'shop', 'theme_optimizer', $merged);

        return response()->json(['data' => $merged]);
    }

    public function shippingCarriersShow(Request $request, ShippingCarrierRegistry $registry): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json(['data' => $registry->hub($tid)]);
    }

    public function shippingCarriersUpdate(Request $request, ModuleSettingsService $settings, ShippingCarrierRegistry $registry): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $payload = $request->validate([
            'tapin' => ['sometimes', 'array'],
            'snapp' => ['sometimes', 'array'],
            'post' => ['sometimes', 'array'],
        ]);
        $current = $registry->hub($tid);
        if (isset($payload['snapp']['api_token']) && $payload['snapp']['api_token'] === '••••••') {
            unset($payload['snapp']['api_token']);
        }
        $merged = array_replace_recursive($current, $payload);
        if (! empty($merged['snapp']['api_token'])) {
            $merged['snapp']['has_api_token'] = true;
        }
        $settings->put($tid, ShippingCarrierRegistry::MODULE, 'hub', $merged);

        return response()->json(['data' => $merged]);
    }

    public function smsPanelsShow(Request $request, SmsPanelAdapterRegistry $registry): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json(['data' => $registry->hub($tid)]);
    }

    public function smsPanelsUpdate(Request $request, ModuleSettingsService $settings, SmsPanelAdapterRegistry $registry): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $payload = $request->validate([
            'active' => ['sometimes', 'string', 'in:modirpayamak,kavenegar'],
            'kavenegar' => ['sometimes', 'array'],
        ]);
        $current = $registry->hub($tid);
        if (isset($payload['kavenegar']['api_key']) && $payload['kavenegar']['api_key'] === '••••••') {
            unset($payload['kavenegar']['api_key']);
        }
        $merged = array_replace_recursive($current, $payload);
        if (! empty($merged['kavenegar']['api_key'])) {
            $merged['kavenegar']['has_api_key'] = true;
        }
        $settings->put($tid, SmsPanelAdapterRegistry::MODULE, 'hub', $merged);

        return response()->json(['data' => $merged]);
    }

    public function trackOrder(Request $request, Order $order, ShippingCarrierRegistry $registry): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $order->tenant_id !== (int) $request->user()->tenant_id, 404);

        return response()->json(['data' => $registry->track((int) $order->tenant_id, $order)]);
    }

    public function storefrontAppearanceShow(Request $request, StorefrontAppearanceService $appearance): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $appearance->get((int) $request->user()->tenant_id)]);
    }

    public function storefrontAppearanceUpdate(Request $request, StorefrontAppearanceService $appearance): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'primary_color' => ['sometimes', 'string', 'max:9'],
            'accent_color' => ['sometimes', 'string', 'max:9'],
            'navy_color' => ['sometimes', 'string', 'max:9'],
            'surface_color' => ['sometimes', 'string', 'max:9'],
            'header_bg' => ['sometimes', 'string', 'max:9'],
            'footer_bg' => ['sometimes', 'string', 'max:9'],
            'border_color' => ['sometimes', 'string', 'max:9'],
            'header_style' => ['sometimes', 'string', 'max:40'],
            'mega_menu' => ['sometimes', 'boolean'],
            'dark_mode_default' => ['sometimes', 'boolean'],
            'show_top_bar' => ['sometimes', 'boolean'],
            'top_bar_text' => ['sometimes', 'nullable', 'string', 'max:255'],
            'product_card_style' => ['sometimes', 'string', 'max:40'],
            'pdp_gallery_style' => ['sometimes', 'string', 'max:40'],
            'sticky_add_to_cart' => ['sometimes', 'boolean'],
            'show_installment_badge' => ['sometimes', 'boolean'],
            'footer_columns' => ['sometimes', 'integer', 'min:1', 'max:6'],
        ]);

        return response()->json(['data' => $appearance->save((int) $request->user()->tenant_id, $data)]);
    }

    public function productNotificationsShow(Request $request, ProductNotificationSettings $settings): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $settings->get((int) $request->user()->tenant_id)]);
    }

    public function productNotificationsUpdate(Request $request, ProductNotificationSettings $settings): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'back_in_stock_enabled' => ['sometimes', 'boolean'],
            'on_sale_enabled' => ['sometimes', 'boolean'],
            'channel_email' => ['sometimes', 'boolean'],
            'channel_sms' => ['sometimes', 'boolean'],
            'from_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'sms_template_back_in_stock' => ['sometimes', 'nullable', 'string', 'max:500'],
            'sms_template_on_sale' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        return response()->json(['data' => $settings->save((int) $request->user()->tenant_id, $data)]);
    }
}
