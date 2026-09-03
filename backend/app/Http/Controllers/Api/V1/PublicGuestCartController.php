<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use Illuminate\Http\Request;
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

    public function addItem(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);

        $data = $request->validate([
            'product_id' => ['required', 'integer'],
            'quantity' => ['nullable', 'integer', 'min:1'],
            'guest_token' => ['nullable', 'string', 'max:64'],
            'table_number' => ['nullable', 'string', 'max:32'],
            'branch_slug' => ['nullable', 'string', 'max:255'],
        ]);

        $product = Product::query()->findOrFail($data['product_id']);
        abort_if($product->tenant_id !== $tid || $product->is_hidden || ! $product->is_available || $product->is_sold_out, 422);

        $cart = $this->resolveCart($request, $data, true);
        $qty = $data['quantity'] ?? 1;

        $line = CartItem::query()->firstOrNew([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
        ]);
        $line->quantity = ($line->exists ? $line->quantity : 0) + $qty;
        $line->save();

        $cart->load(['items.product']);

        return response()->json(['data' => $cart]);
    }

    public function checkout(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);

        $meta = $request->validate([
            'customer_phone' => ['nullable', 'string', 'max:32'],
            'customer_note' => ['nullable', 'string', 'max:500'],
            'guest_token' => ['nullable', 'string', 'max:64'],
            'table_number' => ['nullable', 'string', 'max:32'],
            'branch_slug' => ['nullable', 'string', 'max:255'],
        ]);

        $cart = $this->resolveCart($request, $meta, true);
        if (! $cart) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }

        $lines = CartItem::query()->where('cart_id', $cart->id)->with('product')->get();

        if ($lines->isEmpty()) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }

        $total = 0;
        foreach ($lines as $line) {
            $total += $line->quantity * $line->product->price_minor;
        }

        $order = \App\Models\Order::query()->create([
            'tenant_id' => $tid,
            'user_id' => null,
            'status' => 'pending_payment',
            'total_minor' => $total,
            'currency' => $lines->first()->product->currency,
            'customer_phone' => $meta['customer_phone'] ?? null,
            'customer_note' => $meta['customer_note'] ?? null,
            'table_number' => $meta['table_number'] ?? $cart->table_number,
            'branch_slug' => $meta['branch_slug'] ?? $cart->branch_slug,
            'meta' => ['source' => 'guest_table'],
        ]);

        foreach ($lines as $line) {
            \App\Models\OrderItem::query()->create([
                'order_id' => $order->id,
                'product_id' => $line->product_id,
                'quantity' => $line->quantity,
                'unit_price_minor' => $line->product->price_minor,
            ]);
        }

        CartItem::query()->where('cart_id', $cart->id)->delete();

        return response()->json(['data' => $order->load('items.product')], 201);
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
