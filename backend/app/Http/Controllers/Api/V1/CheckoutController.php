<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CartItem;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CheckoutController extends Controller
{
    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $checkoutMeta = $request->validate([
            'shipping_address' => ['nullable', 'string', 'max:5000'],
            'customer_phone' => ['nullable', 'string', 'max:32'],
            'customer_note' => ['nullable', 'string', 'max:500'],
        ]);

        $user = $request->user();

        $cart = \App\Models\Cart::query()->where([
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
        ])->first();

        if (! $cart) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }

        $lines = CartItem::query()->where('cart_id', $cart->id)->with('product')->get();
        if ($lines->isEmpty()) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }

        $order = DB::transaction(function () use ($lines, $user, $cart, $checkoutMeta) {
            $total = 0;
            foreach ($lines as $line) {
                $total += $line->quantity * $line->product->price_minor;
            }

            $order = Order::query()->create([
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'status' => 'pending_payment',
                'total_minor' => $total,
                'currency' => $lines->first()->product->currency,
                'shipping_address' => $checkoutMeta['shipping_address'] ?? null,
                'customer_phone' => $checkoutMeta['customer_phone'] ?? null,
                'customer_note' => $checkoutMeta['customer_note'] ?? null,
            ]);

            foreach ($lines as $line) {
                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'product_id' => $line->product_id,
                    'quantity' => $line->quantity,
                    'unit_price_minor' => $line->product->price_minor,
                ]);
            }

            CartItem::query()->where('cart_id', $cart->id)->delete();

            return $order->load('items.product');
        });

        return response()->json(['data' => $order], 201);
    }
}
