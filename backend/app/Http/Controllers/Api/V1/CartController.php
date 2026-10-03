<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Services\Pricing\PurchaseTypeService;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\Request;

class CartController extends Controller
{
    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        return $this->respond($this->cartFor($request));
    }

    public function addItem(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer'],
            'quantity' => ['nullable', 'integer', 'min:1'],
            'purchase_type' => ['nullable', 'string', 'in:cash,retail,credit,installment,wholesale'],
            'installment_months' => ['nullable', 'integer', 'min:1'],
        ]);

        $user = $request->user();
        $product = Product::query()->findOrFail($data['product_id']);
        abort_if($product->tenant_id !== $user->tenant_id, 403);
        abort_unless(
            $product->status === 'publish' && ! $product->is_hidden && $product->is_available && ! $product->is_sold_out,
            422
        );

        $cart = $this->cartFor($request);
        $types = PurchaseTypeService::forTenant($cart->tenant_id);

        $qty = $data['quantity'] ?? 1;

        /** @var CartItem $line */
        $line = CartItem::query()->firstOrNew([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
        ]);
        $line->quantity = ($line->exists ? $line->quantity : 0) + $qty;
        $line->save();

        $lines = CartItem::query()->where('cart_id', $cart->id)->get();
        $current = $types->cartType($lines->where('id', '!=', $line->id)->values());
        $requested = array_key_exists('purchase_type', $data) && $data['purchase_type'] !== null
            ? $types->normalize($data['purchase_type'])
            : ($lines->count() > 1 ? $current['type'] : $types->normalize(null));
        $type = $current['type'] === 'wholesale' && $lines->count() > 1 ? 'wholesale' : $requested;
        $months = $type === 'installment' ? ($data['installment_months'] ?? $current['months']) : null;
        $types->applyToCart($cart, $type, $months);

        return $this->respond($cart, $types);
    }

    public function setPurchaseType(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'purchase_type' => ['required', 'string', 'in:cash,retail,credit,installment,wholesale'],
            'installment_months' => ['nullable', 'integer', 'min:1'],
        ]);
        $cart = $this->cartFor($request);
        $types = PurchaseTypeService::forTenant($cart->tenant_id);
        $types->applyToCart($cart, $data['purchase_type'], $data['installment_months'] ?? null);

        return $this->respond($cart, $types);
    }

    public function setQuantity(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'quantity' => ['required', 'integer', 'min:0', 'max:999'],
        ]);

        $user = $request->user();
        abort_if($product->tenant_id !== $user->tenant_id, 403);

        $cart = $this->cartFor($request);
        $existing = CartItem::query()
            ->where('cart_id', $cart->id)
            ->where('product_id', $product->id)
            ->first();

        $qty = (int) $data['quantity'];
        if ($qty === 0) {
            $existing?->delete();

            return $this->respond($cart);
        }

        abort_unless(
            $product->status === 'publish' && ! $product->is_hidden && $product->is_available && ! $product->is_sold_out,
            422
        );
        if ($product->manage_stock && $product->stock !== null && $qty > (int) $product->stock) {
            return response()->json(['message' => __('api.insufficient_stock')], 422);
        }

        $line = $existing ?? new CartItem([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
        ]);
        $line->quantity = $qty;
        $line->save();

        return $this->respond($cart);
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

        return $this->respond($cart);
    }

    protected function respond(Cart $cart, ?PurchaseTypeService $types = null): \Illuminate\Http\JsonResponse
    {
        $cart->load(['items.product']);
        $types ??= PurchaseTypeService::forTenant($cart->tenant_id);
        $payload = $cart->toArray();
        $payload['pricing'] = $types->quote($cart->items);

        return response()->json(['data' => $payload]);
    }

    protected function cartFor(Request $request): Cart
    {
        $user = $request->user();

        /** @var Cart $cart */
        $cart = Cart::query()->firstOrCreate([
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
        ]);

        $this->expireHeldStock($cart);

        return $cart;
    }

    protected function expireHeldStock(Cart $cart): void
    {
        $minutes = ShopSettings::getProducts((int) $cart->tenant_id)['hold_stock_minutes'] ?? null;
        if ($minutes === null || $minutes === '' || (int) $minutes <= 0) {
            return;
        }
        $cutoff = now()->subMinutes(max(1, (int) $minutes));
        if ($cart->updated_at && $cart->updated_at->greaterThan($cutoff)) {
            return;
        }
        if ($cart->items()->exists()) {
            $cart->items()->delete();
            $cart->touch();
        }
    }
}
