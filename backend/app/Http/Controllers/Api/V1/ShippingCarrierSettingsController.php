<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Shipping\ShippingCarrierSettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ShippingCarrierSettingsController extends Controller
{
    public function __construct(protected ShippingCarrierSettingsService $carriers) {}

    public function show(Request $request, string $carrier): \Illuminate\Http\JsonResponse
    {
        $carrier = $this->normalize($carrier);

        return response()->json([
            'settings' => $this->carriers->getPublic((int) $request->user()->tenant_id, $carrier),
            'enabled' => $this->carriers->isEnabled((int) $request->user()->tenant_id, $carrier),
        ]);
    }

    public function update(Request $request, string $carrier): \Illuminate\Http\JsonResponse
    {
        $carrier = $this->normalize($carrier);
        $body = $request->all();
        $input = is_array($body['settings'] ?? null) ? $body['settings'] : $body;
        unset($input['settings'], $input['_meta']);
        $enabled = null;
        if (array_key_exists('enabled', $input)) {
            $enabled = (bool) $input['enabled'];
            unset($input['enabled']);
        }
        if (array_key_exists('enabled', $body) && $enabled === null) {
            $enabled = (bool) $body['enabled'];
        }

        $tid = (int) $request->user()->tenant_id;
        $settings = $this->carriers->save($tid, $carrier, $input);
        if ($enabled !== null) {
            $this->carriers->setCarrierEnabled($tid, $carrier, $enabled);
        }

        return response()->json([
            'settings' => $settings,
            'enabled' => $this->carriers->isEnabled($tid, $carrier),
        ]);
    }

    public function test(Request $request, string $carrier): \Illuminate\Http\JsonResponse
    {
        $carrier = $this->normalize($carrier);
        $tid = (int) $request->user()->tenant_id;
        $result = $this->carriers->testConnection($tid, $carrier);
        Log::info('shipping.carrier.test', [
            'tenant_id' => $tid,
            'carrier' => $carrier,
            'ok' => (bool) ($result['ok'] ?? false),
        ]);

        return response()->json(['data' => $result]);
    }

    protected function normalize(string $carrier): string
    {
        $carrier = str_replace('-', '_', strtolower(trim($carrier)));
        if (! $this->carriers->catalog()->has($carrier)) {
            abort(404, 'Unknown shipping carrier');
        }

        return $carrier;
    }
}
