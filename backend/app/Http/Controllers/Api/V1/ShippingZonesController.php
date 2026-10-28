<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Shipping\ShippingZonesService;
use App\Services\Shipping\TapinClient;
use App\Services\Shipping\TapinShipmentService;
use Illuminate\Http\Request;

class ShippingZonesController extends Controller
{
    public function __construct(
        protected ShippingZonesService $zones,
        protected TapinShipmentService $tapinShipments,
        protected TapinClient $tapin,
    ) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json($this->zones->list((int) $request->user()->tenant_id));
    }

    public function saveGlobal(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'enable_shipping' => ['sometimes', 'boolean'],
            'default_method' => ['sometimes', 'string', 'max:64'],
            'free_shipping_min' => ['sometimes', 'integer', 'min:0'],
            'packaging' => ['sometimes', 'array'],
            'packaging.enabled' => ['sometimes', 'boolean'],
            'packaging.boxes' => ['sometimes', 'array', 'max:30'],
            'show_map' => ['sometimes', 'boolean'],
            'require_city' => ['sometimes', 'boolean'],
            'professional_packaging' => ['sometimes', 'array'],
            'districts' => ['sometimes', 'array', 'max:500'],
        ]);

        return response()->json([
            'global' => $this->zones->saveGlobal((int) $request->user()->tenant_id, $data),
        ]);
    }

    public function storeZone(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);

        return response()->json([
            'zone' => $this->zones->createZone((int) $request->user()->tenant_id, $data['name']),
        ], 201);
    }

    public function updateZone(Request $request, int $zone): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'locations' => ['sometimes', 'array'],
            'locations.*.type' => ['required_with:locations', 'string', 'in:country,state,postcode'],
            'locations.*.code' => ['required_with:locations', 'string', 'max:64'],
        ]);
        $row = $this->zones->updateZone((int) $request->user()->tenant_id, $zone, $data);
        if (! $row) {
            abort(404, 'Zone not found');
        }

        return response()->json(['zone' => $row]);
    }

    public function destroyZone(Request $request, int $zone): \Illuminate\Http\JsonResponse
    {
        if (! $this->zones->deleteZone((int) $request->user()->tenant_id, $zone)) {
            abort(404, 'Zone not found');
        }

        return response()->json(['ok' => true]);
    }

    public function storeMethod(Request $request, int $zone): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'method_id' => ['required', 'string', 'max:64'],
        ]);
        $row = $this->zones->addMethod((int) $request->user()->tenant_id, $zone, $data['method_id']);
        if (! $row) {
            abort(404, 'Zone not found');
        }

        return response()->json(['method' => $row], 201);
    }

    public function updateMethod(Request $request, int $zone, int $method): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'title' => ['sometimes', 'string', 'max:120'],
            'settings' => ['sometimes', 'array'],
        ]);
        $row = $this->zones->updateMethod((int) $request->user()->tenant_id, $zone, $method, $data);
        if (! $row) {
            abort(404, 'Method not found');
        }

        return response()->json(['method' => $row]);
    }

    public function destroyMethod(Request $request, int $zone, int $method): \Illuminate\Http\JsonResponse
    {
        if (! $this->zones->deleteMethod((int) $request->user()->tenant_id, $zone, $method)) {
            abort(404, 'Method not found');
        }

        return response()->json(['ok' => true]);
    }

    public function quote(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'state_code' => ['nullable', 'string', 'max:32'],
            'postcode' => ['nullable', 'string', 'max:20'],
            'city' => ['nullable', 'string', 'max:80'],
            'province_code' => ['nullable', 'integer'],
            'city_code' => ['nullable', 'integer'],
            'weight_g' => ['nullable', 'integer', 'min:1'],
            'cart_subtotal_minor' => ['nullable', 'integer', 'min:0'],
        ]);
        $tid = (int) $request->user()->tenant_id;
        $subtotal = (int) ($data['cart_subtotal_minor'] ?? 0);
        $rates = $this->zones->quote(
            $tid,
            $data['state_code'] ?? null,
            $data['postcode'] ?? null,
            $subtotal,
            $data['city'] ?? null,
            $this->cartLines($request)
        );

        foreach ($rates as $i => $rate) {
            if (($rate['method_id'] ?? '') !== 'tapin') {
                continue;
            }
            $service = $rate['service'];
            $live = $this->tapinShipments->quoteCost($tid, [
                'province_code' => $data['province_code'] ?? null,
                'city_code' => $data['city_code'] ?? null,
                'weight_g' => $data['weight_g'] ?? 500,
                'cart_subtotal' => $subtotal,
                'service' => $service,
            ]);
            if ($live !== null) {
                $rates[$i]['cost_minor'] = $live;
                $rates[$i]['live'] = true;
            }
        }

        return response()->json(['rates' => $rates]);
    }

    /** Region select at checkout: provinces + cities that have per-city rates. */
    public function regions(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $state = (string) $request->query('state_code', '');
        $cfg = $this->zones->getConfig($tid);

        return response()->json(['data' => [
            'states' => ShippingZonesService::IR_STATES,
            'cities' => $state !== '' ? $this->zones->citiesFor($tid, $state) : [],
            'show_map' => (bool) ($cfg['global']['show_map'] ?? false),
            'require_city' => (bool) ($cfg['global']['require_city'] ?? false),
            'districts' => ShippingZonesService::sanitizeDistricts($cfg['global']['districts'] ?? []),
            'professional_packaging' => ShippingZonesService::sanitizeProfessionalPackaging($cfg['global']['professional_packaging'] ?? []),
        ]]);
    }

    /** Current user's cart lines (for packaging); null when there is no cart. */
    protected function cartLines(Request $request): ?\Illuminate\Support\Collection
    {
        $user = $request->user();
        $cart = \App\Models\Cart::query()->where('tenant_id', $user->tenant_id)->where('user_id', $user->id)->first();
        if (! $cart) {
            return null;
        }
        $lines = \App\Models\CartItem::query()->where('cart_id', $cart->id)->with('product')->get();

        return $lines->isEmpty() ? null : $lines;
    }
}
