<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CartItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\Coupons\CouponService;
use App\Services\Orders\OrderTax;
use App\Services\Pricing\PurchaseTypeService;
use App\Services\Shipping\ShippingZonesService;
use App\Services\Shipping\TapinShipmentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CheckoutController extends Controller
{
    public function __construct(
        protected CouponService $coupons,
        protected ShippingZonesService $shipping,
        protected TapinShipmentService $tapinShipments,
    ) {}

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $checkoutMeta = $request->validate([
            'shipping_address' => ['nullable'],
            'customer_phone' => ['nullable', 'string', 'max:32'],
            'customer_note' => ['nullable', 'string', 'max:500'],
            'coupon_code' => ['nullable', 'string', 'max:64'],
            'channel' => ['nullable', 'string', 'in:site,bale,telegram'],
            'shipping_instance_id' => ['nullable', 'integer', 'min:1'],
            'shipping_state_code' => ['nullable', 'string', 'max:32'],
            'shipping_postcode' => ['nullable', 'string', 'max:20'],
            'shipping_province_code' => ['nullable', 'integer'],
            'shipping_city_code' => ['nullable', 'integer'],
            'shipping_minor' => ['nullable', 'integer', 'min:0'],
            'torob_clid' => ['nullable', 'string', 'max:128'],
        ]);
        $torobClid = \App\Services\Marketplace\Adapters\TorobAdapter::sanitizeClid(
            (string) ($checkoutMeta['torob_clid'] ?? $request->cookie('torob_clid') ?? '')
        );
        if ($torobClid !== null) {
            $checkoutMeta['torob_clid'] = $torobClid;
        } else {
            unset($checkoutMeta['torob_clid']);
        }

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

        $types = PurchaseTypeService::forTenant((int) $user->tenant_id);
        ['type' => $purchaseType, 'months' => $months] = $types->cartType($lines);

        $order = DB::transaction(function () use ($lines, $user, $cart, $checkoutMeta, $types, $purchaseType, $months) {
            $subtotal = 0;
            $linePayload = [];
            $unitPrices = [];
            $weightG = 0;
            foreach ($lines as $line) {
                $unit = $types->unitPrice($line->product, $purchaseType, $months);
                $unitPrices[$line->id] = $unit;
                $subtotal += $line->quantity * $unit;
                $weightG += max(100, (int) $line->quantity * 200);
                $linePayload[] = [
                    'product_id' => $line->product_id,
                    'unit_price_minor' => $unit,
                    'quantity' => $line->quantity,
                ];
            }

            $discount = 0;
            $couponId = null;
            $couponCode = null;
            $coupon = null;
            $applied = null;
            if (! empty($checkoutMeta['coupon_code'])) {
                $applied = $this->coupons->apply(
                    $user->tenant_id,
                    $checkoutMeta['coupon_code'],
                    $subtotal,
                    $linePayload,
                    $user->id,
                    $checkoutMeta['channel'] ?? 'site'
                );
            } else {
                $applied = $this->coupons->bestAutoApply(
                    (int) $user->tenant_id,
                    $subtotal,
                    $linePayload,
                    $user->id,
                    $checkoutMeta['channel'] ?? 'site'
                );
            }
            if ($applied) {
                $discount = $applied['discount_minor'];
                $coupon = $applied['coupon'];
                $couponId = $coupon->id;
                $couponCode = $coupon->code;
            }

            $stateCode = $checkoutMeta['shipping_state_code'] ?? null;
            $postcode = $checkoutMeta['shipping_postcode'] ?? null;
            if (is_array($checkoutMeta['shipping_address'] ?? null)) {
                $addr = $checkoutMeta['shipping_address'];
                $stateCode = $stateCode ?: ($addr['state_code'] ?? $addr['state'] ?? null);
                $postcode = $postcode ?: ($addr['postcode'] ?? null);
            }

            $shippingMinor = 0;
            $shippingMeta = [];
            $rates = $this->shipping->quote(
                (int) $user->tenant_id,
                is_string($stateCode) ? $stateCode : null,
                is_string($postcode) ? $postcode : null,
                max(0, $subtotal - $discount)
            );
            $picked = null;
            if (! empty($checkoutMeta['shipping_instance_id'])) {
                foreach ($rates as $rate) {
                    if ((int) $rate['instance_id'] === (int) $checkoutMeta['shipping_instance_id']) {
                        $picked = $rate;
                        break;
                    }
                }
            } elseif ($rates !== []) {
                $picked = $rates[0];
            }

            if ($picked) {
                $shippingMinor = (int) $picked['cost_minor'];
                if (($picked['method_id'] ?? '') === 'tapin') {
                    $live = $this->tapinShipments->quoteCost((int) $user->tenant_id, [
                        'province_code' => $checkoutMeta['shipping_province_code'] ?? null,
                        'city_code' => $checkoutMeta['shipping_city_code'] ?? null,
                        'weight_g' => $weightG,
                        'cart_subtotal' => max(0, $subtotal - $discount),
                        'service' => $picked['service'],
                    ]);
                    if ($live !== null) {
                        $shippingMinor = $live;
                    }
                }
                $shippingMeta = [
                    'shipping_instance_id' => $picked['instance_id'],
                    'shipping_method_id' => $picked['method_id'],
                    'shipping_title' => $picked['title'],
                    'shipping_zone_id' => $picked['zone_id'],
                    'shipping_service' => $picked['service'],
                ];
            } elseif (isset($checkoutMeta['shipping_minor'])) {
                $shippingMinor = (int) $checkoutMeta['shipping_minor'];
            }

            if ($applied) {
                $shippingBefore = $shippingMinor;
                $shippingMinor = $this->coupons->shippingAfter($applied, $shippingMinor);
                if ($shippingMinor !== $shippingBefore) {
                    $shippingMeta['coupon_shipping_discount_minor'] = $shippingBefore - $shippingMinor;
                }
            }

            if (! empty($checkoutMeta['torob_clid'])) {
                $shippingMeta['torob_clid'] = $checkoutMeta['torob_clid'];
            }
            if ($types->active()) {
                $shippingMeta['wfcp_purchase_type'] = $purchaseType;
                if ($months) {
                    $shippingMeta['wfcp_installment_months'] = $months;
                }
            }

            $shippingAddress = $checkoutMeta['shipping_address'] ?? null;
            if ($shippingAddress === null || $shippingAddress === '' || (is_array($shippingAddress) && trim(implode('', array_map('strval', $shippingAddress))) === '')) {
                $shippingAddress = \App\Services\Shop\ShopSettings::defaultCustomerAddress((int) $user->tenant_id);
            }
            if (is_array($shippingAddress)) {
                $shippingAddress = json_encode($shippingAddress, JSON_UNESCAPED_UNICODE);
            }

            $requireLogin = (bool) (\App\Services\Shop\ShopSettings::getDownloads((int) $user->tenant_id)['require_login'] ?? true);

            $tax = OrderTax::compute((int) $user->tenant_id, max(0, $subtotal - $discount), $shippingMinor);
            if ($tax['lines'] !== []) {
                $shippingMeta['tax_lines'] = $tax['lines'];
                $shippingMeta['prices_include_tax'] = $tax['added_minor'] === 0;
            }

            $order = Order::query()->create([
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'status' => 'pending_payment',
                'subtotal_minor' => $subtotal,
                'discount_minor' => $discount,
                'shipping_minor' => $shippingMinor,
                'tax_minor' => $tax['tax_minor'],
                'total_minor' => max(0, $subtotal - $discount + $shippingMinor + $tax['added_minor']),
                'currency' => $lines->first()->product->currency,
                'shipping_address' => $shippingAddress,
                'customer_phone' => $checkoutMeta['customer_phone'] ?? null,
                'customer_note' => $checkoutMeta['customer_note'] ?? null,
                'coupon_code' => $couponCode,
                'coupon_id' => $couponId,
                'meta' => $shippingMeta !== [] ? $shippingMeta : null,
            ]);

            foreach ($lines as $line) {
                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'product_id' => $line->product_id,
                    'quantity' => $line->quantity,
                    'unit_price_minor' => $unitPrices[$line->id],
                    'purchase_type' => $purchaseType,
                    'meta' => $months ? ['wfcp_installment_months' => $months] : null,
                    'requires_login' => $requireLogin && (($line->product->type ?? '') === 'downloadable'),
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
