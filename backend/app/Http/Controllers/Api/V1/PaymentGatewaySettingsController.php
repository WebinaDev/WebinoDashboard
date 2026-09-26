<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Payments\PaymentGatewaySettingsService;
use Illuminate\Http\Request;

class PaymentGatewaySettingsController extends Controller
{
    /** @var list<string> */
    private const PROVIDERS = ['zarinpal', 'digipay', 'snapppay', 'torobpay', 'bale_pay', 'wallet', 'c2c'];

    public function __construct(protected PaymentGatewaySettingsService $gateways) {}

    public function show(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $provider = $this->normalize($provider);

        return response()->json([
            'settings' => $this->gateways->getPublic((int) $request->user()->tenant_id, $provider),
        ]);
    }

    public function update(Request $request, string $provider): \Illuminate\Http\JsonResponse
    {
        $provider = $this->normalize($provider);
        $body = $request->all();
        $input = is_array($body['settings'] ?? null) ? $body['settings'] : $body;
        unset($input['settings']);

        return response()->json([
            'settings' => $this->gateways->save((int) $request->user()->tenant_id, $provider, $input),
        ]);
    }

    protected function normalize(string $provider): string
    {
        $provider = str_replace('-', '_', strtolower(trim($provider)));
        if (! in_array($provider, self::PROVIDERS, true)) {
            abort(404, 'Unknown payment provider');
        }

        return $provider;
    }
}
