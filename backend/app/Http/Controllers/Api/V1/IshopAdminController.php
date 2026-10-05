<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shipping\ShippingCarrierRegistry;
use App\Services\Sms\SmsPanelAdapterRegistry;
use Illuminate\Http\Request;

class IshopAdminController extends Controller
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
}
