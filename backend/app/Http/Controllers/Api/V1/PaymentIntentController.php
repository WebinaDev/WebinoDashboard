<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Payments\PaymentCheckoutService;
use Illuminate\Http\Request;

class PaymentIntentController extends Controller
{
    public function store(Request $request, PaymentCheckoutService $checkout): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'order_id' => ['required', 'integer'],
            'provider' => ['required', 'string', 'in:digipay,zarinpal'],
        ]);

        $user = $request->user();
        $order = Order::query()->findOrFail($data['order_id']);
        abort_if($order->tenant_id !== $user->tenant_id, 403);

        try {
            $intent = $checkout->createIntent($order, $data['provider']);
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
            'data' => $intent,
        ]);
    }
}
