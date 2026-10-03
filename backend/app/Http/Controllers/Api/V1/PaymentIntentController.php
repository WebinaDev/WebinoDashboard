<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Services\Payments\PaymentCheckoutService;
use App\Services\Payments\PaymentGatewaySettingsService;
use Illuminate\Http\Request;

class PaymentIntentController extends Controller
{
    public function options(Request $request, PaymentGatewaySettingsService $gateways): \Illuminate\Http\JsonResponse
    {
        $mode = $request->query('mode');
        $mode = is_string($mode) && in_array($mode, ['cash', 'installment'], true) ? $mode : null;
        $tid = (int) $request->user()->tenant_id;
        $rows = $gateways->checkoutGateways($tid, $mode);

        $orderId = (int) $request->query('order_id', 0);
        if ($orderId > 0) {
            $order = Order::query()->where('tenant_id', $tid)->whereKey($orderId)->first();
            if ($order) {
                $rows = array_map(function (array $row) use ($gateways, $order) {
                    $settings = $gateways->getRaw((int) $order->tenant_id, (string) $row['id']);
                    $row['quote'] = $gateways->feeQuote($settings, (int) $order->total_minor);

                    return $row;
                }, $rows);
            }
        }

        return response()->json(['gateways' => $rows]);
    }

    public function store(Request $request, PaymentCheckoutService $checkout): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'order_id' => ['required', 'integer'],
            'provider' => ['required', 'string', 'in:digipay,zarinpal,snapppay,torobpay,bale_pay,basalam_pay'],
            'mode' => ['nullable', 'string', 'in:cash,installment'],
        ]);

        $user = $request->user();
        $order = Order::query()->findOrFail($data['order_id']);
        abort_if($order->tenant_id !== $user->tenant_id, 403);

        try {
            $intent = $checkout->createIntent($order, $data['provider'], $data['mode'] ?? null);
        } catch (\DomainException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 502);
        }

        $order->update([
            'payment_provider' => $data['provider'],
            'status' => 'awaiting_gateway',
        ]);

        return response()->json([
            'data' => $this->publicIntent($intent),
        ]);
    }

    /** @return array<string, mixed> */
    protected function publicIntent(PaymentIntent $intent): array
    {
        $meta = is_array($intent->meta) ? $intent->meta : [];

        return [
            'id' => $intent->id,
            'provider' => $intent->provider,
            'status' => $intent->status,
            'redirect_url' => $intent->redirect_url,
            'mode' => $meta['mode'] ?? null,
            'fee_percent' => $meta['fee_percent'] ?? 0,
            'fee_payer' => $meta['fee_payer'] ?? 'merchant',
            'fee_minor' => $meta['fee_minor'] ?? 0,
            'base_minor' => $meta['base_minor'] ?? null,
            'charge_minor' => $meta['charge_minor'] ?? null,
        ];
    }
}
