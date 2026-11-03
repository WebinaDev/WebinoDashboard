<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Shipping\ShippingCarrierSettingsService;
use Illuminate\Http\Request;

class ShippingHubController extends Controller
{
    public function __construct(protected ShippingCarrierSettingsService $carriers) {}

    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $payload = $this->carriers->hubPayload($tid);

        return response()->json($payload);
    }

    public function update(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'enabled' => ['sometimes', 'array'],
        ]);
        $this->carriers->saveHub($tid, $data);

        return response()->json($this->carriers->hubPayload($tid));
    }

    public function toggle(Request $request, string $carrier): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $carrier = str_replace('-', '_', $carrier);
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        $this->carriers->setCarrierEnabled($tid, $carrier, (bool) $data['enabled']);

        return response()->json($this->carriers->hubPayload($tid));
    }
}
