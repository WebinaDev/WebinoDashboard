<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Modules\Cafe\Services\CafeOrdering;

/**
 * Price a delivery basket for a map pin before checkout: distance, zone, fee and whether
 * the address is inside the «محدوده ارسال پیک». The cart total in the drawer and the order
 * written at checkout both use the same server quote, so a guest never sees a fee change
 * between the map and the receipt.
 */
class PublicCafeQuoteController extends Controller
{
    use ResolvesPublicTenant;

    public function delivery(Request $request, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:24,40'],
            'lng' => ['required', 'numeric', 'between:44,64'],
            'subtotal_minor' => ['nullable', 'integer', 'min:0'],
            'items' => ['nullable', 'integer', 'min:0', 'max:500'],
        ]);

        $status = $ordering->publicStatus($tid);
        $distance = null;
        if ($status['cafe_location']) {
            $distance = CafeOrdering::distanceKm(
                (float) $status['cafe_location']['lat'],
                (float) $status['cafe_location']['lng'],
                (float) $data['lat'],
                (float) $data['lng'],
            );
        }

        $subtotal = max(0, (int) ($data['subtotal_minor'] ?? 0));
        $items = max(0, (int) ($data['items'] ?? 0));
        $fees = $ordering->fees($tid, 'delivery', $subtotal, max(1, $items), $distance);

        $radius = max((float) $status['delivery_radius_km'], $ordering->zonesMaxKm($tid));
        $inZone = $distance === null || $radius <= 0 || $distance <= $radius;
        $zone = $distance !== null ? $this->zoneFor($status['delivery_zones'], $distance) : null;

        return response()->json([
            'data' => [
                'distance_km' => $distance !== null ? round($distance, 2) : null,
                'in_zone' => $inZone,
                'radius_km' => $radius > 0 ? $radius : null,
                'zone' => $zone,
                'fees' => $fees,
            ],
        ])->header('Cache-Control', 'no-store');
    }

    /**
     * @param  list<array<string, mixed>>  $zones
     * @return array<string, mixed>|null
     */
    private function zoneFor(array $zones, float $km): ?array
    {
        foreach ($zones as $zone) {
            $min = (float) ($zone['min_km'] ?? 0);
            $max = (float) ($zone['max_km'] ?? 0);
            if ($km >= $min && ($km < $max || abs($km - $max) < 0.0001)) {
                return $zone;
            }
        }

        return null;
    }
}
