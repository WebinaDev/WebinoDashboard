<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Shipping\TapinClient;
use App\Services\Shipping\TapinShipmentService;
use Illuminate\Http\Request;

class TapinController extends Controller
{
    public function __construct(
        protected TapinClient $tapin,
        protected TapinShipmentService $shipments,
    ) {}

    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $settings = $this->tapin->getPublic($tid);
        $credit = null;
        if (! empty($settings['show_credit']) && ! empty($settings['has_token'])) {
            $credit = $this->tapin->creditAmount($tid);
        }

        return response()->json([
            'settings' => $settings,
            'credit' => $credit,
        ]);
    }

    public function update(Request $request): \Illuminate\Http\JsonResponse
    {
        $body = $request->all();
        $input = is_array($body['settings'] ?? null) ? $body['settings'] : $body;
        unset($input['settings'], $input['has_token'], $input['connected'], $input['credit']);

        return response()->json([
            'settings' => $this->tapin->save((int) $request->user()->tenant_id, $input),
        ]);
    }

    public function testConnection(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $res = $this->tapin->shopList($tid);
        $shops = [];
        if (is_array($res['entries'])) {
            $list = $res['entries']['list'] ?? $res['entries']['shops'] ?? $res['entries'];
            if (is_array($list)) {
                foreach ($list as $shop) {
                    if (! is_array($shop)) {
                        continue;
                    }
                    $shops[] = [
                        'id' => (string) ($shop['shop_id'] ?? $shop['id'] ?? ''),
                        'title' => (string) ($shop['title'] ?? $shop['name'] ?? ''),
                    ];
                }
            }
        }

        return response()->json([
            'ok' => $res['ok'],
            'message' => $res['message'],
            'shops' => array_values(array_filter($shops, fn ($s) => $s['id'] !== '')),
        ], $res['ok'] ? 200 : 422);
    }

    public function shops(Request $request): \Illuminate\Http\JsonResponse
    {
        return $this->testConnection($request);
    }

    public function syncLocations(Request $request): \Illuminate\Http\JsonResponse
    {
        $result = $this->tapin->syncLocations((int) $request->user()->tenant_id);

        return response()->json($result, $result['ok'] ? 200 : 422);
    }

    public function credit(Request $request): \Illuminate\Http\JsonResponse
    {
        $amount = $this->tapin->creditAmount((int) $request->user()->tenant_id, true);

        return response()->json(['credit' => $amount]);
    }

    public function registerOrder(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->findOrder($request, $order);
        $service = $request->input('service');
        $result = $this->shipments->register($row->fresh(['items']), is_string($service) ? $service : null);

        return response()->json($result, $result['ok'] ? 200 : 422);
    }

    public function orderStatus(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->findOrder($request, $order);
        $result = $this->shipments->refreshStatus($row);

        return response()->json($result, $result['ok'] ? 200 : 422);
    }

    public function orderLabel(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->findOrder($request, $order);
        $result = $this->shipments->label($row);

        return response()->json($result, $result['ok'] ? 200 : 422);
    }

    protected function findOrder(Request $request, int $orderId): Order
    {
        $row = Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('id', $orderId)
            ->first();
        if (! $row) {
            abort(404, 'Order not found');
        }

        return $row;
    }
}
