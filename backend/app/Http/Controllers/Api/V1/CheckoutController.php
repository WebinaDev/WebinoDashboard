<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CartItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\Coupons\CouponService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CheckoutController extends Controller
{
    public function __construct(protected CouponService $coupons) {}

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $checkoutMeta = $request->validate([
            'shipping_address' => ['nullable', 'string', 'max:5000'],
            'customer_phone' => ['nullable', 'string', 'max:32'],
            'customer_note' => ['nullable', 'string', 'max:500'],
            'coupon_code' => ['nullable', 'string', 'max:64'],
            'channel' => ['nullable', 'string', 'in:site,bale,telegram'],
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
            $subtotal = 0;
            $linePayload = [];
            foreach ($lines as $line) {
                $subtotal += $line->quantity * $line->product->price_minor;
                $linePayload[] = [
                    'product_id' => $line->product_id,
                    'unit_price_minor' => $line->product->price_minor,
                    'quantity' => $line->quantity,
                ];
            }

            $discount = 0;
            $couponId = null;
            $couponCode = null;
            $coupon = null;
            if (! empty($checkoutMeta['coupon_code'])) {
                $applied = $this->coupons->apply(
                    $user->tenant_id,
                    $checkoutMeta['coupon_code'],
                    $subtotal,
                    $linePayload,
                    $user->id,
                    $checkoutMeta['channel'] ?? 'site'
                );
                $discount = $applied['discount_minor'];
                $coupon = $applied['coupon'];
                $couponId = $coupon->id;
                $couponCode = $coupon->code;
            }

            $order = Order::query()->create([
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'status' => 'pending_payment',
                'subtotal_minor' => $subtotal,
                'discount_minor' => $discount,
                'total_minor' => max(0, $subtotal - $discount),
                'currency' => $lines->first()->product->currency,
                'shipping_address' => $checkoutMeta['shipping_address'] ?? null,
                'customer_phone' => $checkoutMeta['customer_phone'] ?? null,
                'customer_note' => $checkoutMeta['customer_note'] ?? null,
                'coupon_code' => $couponCode,
                'coupon_id' => $couponId,
            ]);

            foreach ($lines as $line) {
                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'product_id' => $line->product_id,
                    'quantity' => $line->quantity,
                    'unit_price_minor' => $line->product->price_minor,
                ]);
            }

            if ($coupon) {
                $this->coupons->redeem($coupon, $order, $discount, $user->id);
            }

            CartItem::query()->where('cart_id', $cart->id)->delete();

            return $order->load('items.product');
        });

        return response()->json(['data' => $order], 201);
    }
}
