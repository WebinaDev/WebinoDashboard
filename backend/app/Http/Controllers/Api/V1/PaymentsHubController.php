<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Payments\PaymentGatewaySettingsService;
use Illuminate\Http\Request;

class PaymentsHubController extends Controller
{
    public function __construct(protected PaymentGatewaySettingsService $gateways) {}

    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $hub = $this->gateways->getHub($tid);

        return response()->json([
            'items' => $this->gateways->hubItems($tid),
            'geo_notice' => $hub['geo_notice'] ?? $this->gateways->defaultGeoNotice(),
            'curated_gateway_ids' => PaymentGatewaySettingsService::GATEWAY_IDS,
        ]);
    }

    public function update(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'geo_notice' => ['sometimes', 'array'],
            'geo_notice.enabled' => ['sometimes', 'boolean'],
            'geo_notice.services' => ['sometimes', 'array'],
            'enabled' => ['sometimes', 'array'],
        ]);
        $this->gateways->saveHub($tid, $data);
        $hub = $this->gateways->getHub($tid);

        return response()->json([
            'items' => $this->gateways->hubItems($tid),
            'geo_notice' => $hub['geo_notice'] ?? $this->gateways->defaultGeoNotice(),
            'curated_gateway_ids' => PaymentGatewaySettingsService::GATEWAY_IDS,
        ]);
    }

    public function toggle(Request $request, string $gateway): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $gateway = str_replace('-', '_', $gateway);
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        $this->gateways->setGatewayEnabled($tid, $gateway, (bool) $data['enabled']);

        return response()->json([
            'items' => $this->gateways->hubItems($tid),
        ]);
    }
}
