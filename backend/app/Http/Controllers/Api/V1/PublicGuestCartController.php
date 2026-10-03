<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Order;
use App\Models\Product;
use App\Services\Cafe\CafeOrdering;
use App\Services\Orders\OrderStock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PublicGuestCartController extends Controller
{
    use ResolvesPublicTenant;

    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        $cart = $this->resolveCart($request);
        if (! $cart) {
            return response()->json(['data' => ['items' => [], 'guest_token' => null]]);
        }
        $cart->load(['items.product']);

        return response()->json(['data' => $cart]);
    }

    public function track(Request $request): \Illuminate\Http\JsonResponse
    {
        $token = $request->query('guest_token');
        if (! is_string($token) || strlen($token) < 8) {
            return response()->json(['data' => null]);
        }
        $tid = $this->publicTenantId($request);
        $order = Order::query()
            ->where('tenant_id', $tid)
            ->where('meta->guest_token', $token)
            ->latest()
            ->first();
        if (! $order) {
            return response()->json(['data' => null]);
        }
        $meta = is_array($order->meta) ? $order->meta : [];

        return response()->json(['data' => [
            'id' => $order->id,
            'number' => $order->number ?? $order->id,
            'kitchen_status' => $meta['kitchen_status'] ?? 'new',
            'fulfillment' => $meta['fulfillment'] ?? null,
            'total_minor' => $order->total_minor,
            'currency' => $order->currency,
            'table_number' => $order->table_number,
            'created_at' => $order->created_at,
        ]]);
    }

    public function addItem(Request $request, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $ordering->assertAccepting($tid);

        $data = $request->validate([
            'product_id' => ['required', 'integer'],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:50'],
            'guest_token' => ['nullable', 'string', 'max:64'],
            'table_number' => ['nullable', 'string', 'max:32'],
            'branch_slug' => ['nullable', 'string', 'max:255'],
            'option_ids' => ['nullable', 'array', 'max:30'],
            'option_ids.*' => ['integer'],
            'variant_id' => ['nullable', 'integer'],
        ]);

        $product = Product::query()->findOrFail($data['product_id']);
        abort_if(
            $product->tenant_id !== $tid
            || $product->status !== 'publish'
            || $product->is_hidden
            || ! $product->is_available
            || $product->is_sold_out,
            422
        );

        $priced = $ordering->priceLine($product, $data['option_ids'] ?? [], isset($data['variant_id']) ? (int) $data['variant_id'] : null);
        $cart = $this->resolveCart($request, $data, true);
        $qty = $data['quantity'] ?? 1;

        $line = CartItem::query()->firstOrNew([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
            'line_key' => $priced['line_key'],
        ]);
        $line->quantity = ($line->exists ? $line->quantity : 0) + $qty;
        $line->meta = [
            'selections' => $priced['selections'],
            'variant_id' => $priced['variant_id'],
            'unit_minor' => $priced['unit_minor'],
        ];
        $line->save();

        $cart->load(['items.product']);

        return response()->json(['data' => $cart]);
    }

    public function checkout(Request $request, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $ordering->assertAccepting($tid);

        $meta = $request->validate([
            'customer_phone' => ['nullable', 'string', 'max:32'],
            'customer_note' => ['nullable', 'string', 'max:500'],
            'guest_token' => ['nullable', 'string', 'max:64'],
            'table_number' => ['nullable', 'string', 'max:32'],
            'branch_slug' => ['nullable', 'string', 'max:255'],
            'fulfillment' => ['nullable', 'string', 'in:dine_in,pickup,delivery'],
        ]);

        $status = $ordering->publicStatus($tid);
        $fulfillment = $meta['fulfillment'] ?? 'dine_in';
        $allowed = $status['fulfillment'][$fulfillment] ?? false;
        if (! $allowed) {
            return response()->json(['message' => __('api.cafe_fulfillment')], 422);
        }

        $cart = $this->resolveCart($request, $meta, true);
        if (! $cart) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }

        $lines = CartItem::query()->where('cart_id', $cart->id)->with('product.modifiers')->get();
        if ($lines->isEmpty()) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }

        foreach ($lines as $line) {
            $product = $line->product;
            if (! $product || $product->status !== 'publish' || $product->is_hidden || ! $product->is_available || $product->is_sold_out) {
                return response()->json(['message' => 'cart_not_for_sale', 'errors' => ['code' => ['cart_not_for_sale']]], 422);
            }
        }

        $order = DB::transaction(function () use ($lines, $tid, $meta, $cart, $ordering, $fulfillment) {
            app(OrderStock::class)->assertLinesAvailable($lines);

            $subtotal = 0;
            $pricedLines = [];
            foreach ($lines as $line) {
                $stored = is_array($line->meta) ? $line->meta : [];
                $optionIds = array_map(
                    fn ($row) => (int) ($row['option_id'] ?? 0),
                    is_array($stored['selections'] ?? null) ? $stored['selections'] : []
                );
                $priced = $ordering->priceLine(
                    $line->product,
                    array_values(array_filter($optionIds)),
                    isset($stored['variant_id']) ? (int) $stored['variant_id'] : null
                );
                $pricedLines[] = [$line, $priced];
                $subtotal += $line->quantity * $priced['unit_minor'];
            }

            $shipping = $ordering->shippingMinor($tid, $fulfillment, $subtotal);
            $tax = \App\Services\Orders\OrderTax::compute($tid, $subtotal, $shipping);
            $token = $meta['guest_token'] ?? $cart->guest_token;
            $metaOrder = [
                'source' => 'guest_table',
                'guest_token' => is_string($token) ? $token : null,
                'fulfillment' => $fulfillment,
                'kitchen_status' => 'new',
                'packaging_included' => true,
            ];
            if ($tax['lines'] !== []) {
                $metaOrder['tax_lines'] = $tax['lines'];
                $metaOrder['prices_include_tax'] = $tax['added_minor'] === 0;
            }

            $order = \App\Models\Order::query()->create([
                'tenant_id' => $tid,
                'user_id' => null,
                'status' => 'processing',
                'subtotal_minor' => $subtotal,
                'discount_minor' => 0,
                'shipping_minor' => $shipping,
                'tax_minor' => $tax['tax_minor'],
                'total_minor' => max(0, $subtotal + $shipping + $tax['added_minor']),
                'currency' => $lines->first()->product->currency,
                'customer_phone' => $meta['customer_phone'] ?? null,
                'customer_note' => $meta['customer_note'] ?? null,
                'table_number' => $meta['table_number'] ?? $cart->table_number,
                'branch_slug' => $meta['branch_slug'] ?? $cart->branch_slug,
                'meta' => $metaOrder,
            ]);

            foreach ($pricedLines as [$line, $priced]) {
                \App\Models\OrderItem::query()->create([
                    'order_id' => $order->id,
                    'product_id' => $line->product_id,
                    'product_variant_id' => $priced['variant_id'],
                    'product_name' => $line->product->name,
                    'quantity' => $line->quantity,
                    'unit_price_minor' => $priced['unit_minor'],
                    'meta' => ['selections' => $priced['selections']],
                ]);
            }

            app(\App\Services\Orders\OrderLifecycle::class)->sync($order->fresh(), null);
            CartItem::query()->where('cart_id', $cart->id)->delete();

            return $order->fresh()->load('items.product');
        });

        return response()->json(['data' => $order], 201);
    }

    /** @param  array<string, mixed>  $data */
    private function resolveCart(Request $request, array $data = [], bool $create = false): ?Cart
    {
        $tid = $this->publicTenantId($request);
        $token = $data['guest_token'] ?? $request->header('X-Guest-Token') ?? $request->query('guest_token');

        if (! is_string($token) || $token === '') {
            if (! $create) {
                return null;
            }
            $token = Str::random(32);
        }

        $table = $data['table_number'] ?? $request->query('table');
        $branch = $data['branch_slug'] ?? $request->query('branch');

        return Cart::query()->firstOrCreate(
            ['tenant_id' => $tid, 'guest_token' => $token],
            [
                'user_id' => null,
                'table_number' => is_string($table) ? $table : null,
                'branch_slug' => is_string($branch) ? $branch : null,
            ],
        );
    }
}
