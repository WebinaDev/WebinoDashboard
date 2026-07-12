<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use Illuminate\Http\Request;

class CartController extends Controller
{
    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        $cart = $this->cartFor($request);
        $cart->load(['items.product']);

        return response()->json(['data' => $cart]);
    }

    public function addItem(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer'],
            'quantity' => ['nullable', 'integer', 'min:1'],
        ]);

        $user = $request->user();
        $product = Product::query()->findOrFail($data['product_id']);
        abort_if($product->tenant_id !== $user->tenant_id, 403);

        $cart = $this->cartFor($request);

        $qty = $data['quantity'] ?? 1;

        /** @var CartItem $line */
        $line = CartItem::query()->firstOrNew([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
        ]);
        $line->quantity = ($line->exists ? $line->quantity : 0) + $qty;
        $line->save();

        $cart->load(['items.product']);

        return response()->json(['data' => $cart]);
    }

    public function removeItem(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        abort_if($product->tenant_id !== $user->tenant_id, 403);

        $cart = $this->cartFor($request);
        CartItem::query()
            ->where('cart_id', $cart->id)
            ->where('product_id', $product->id)
            ->delete();

        $cart->load(['items.product']);

        return response()->json(['data' => $cart]);
    }

    protected function cartFor(Request $request): Cart
    {
        $user = $request->user();

        return Cart::query()->firstOrCreate([
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
        ]);
    }
}
