<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\ProductVariant;
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
            'variant_id' => ['nullable', 'integer', 'min:1'],
            'product_variant_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $user = $request->user();
        $product = Product::query()->findOrFail($data['product_id']);
        abort_if($product->tenant_id !== $user->tenant_id, 403);
        abort_unless(
            $product->status === 'publish' && ! $product->is_hidden && $product->is_available && ! $product->is_sold_out,
            422
        );

        $variant = $this->resolveVariant($product, $data['variant_id'] ?? $data['product_variant_id'] ?? null, true);

        $cart = $this->cartFor($request);
        $types = PurchaseTypeService::forTenant($cart->tenant_id);

        $qty = $data['quantity'] ?? 1;

        /** @var CartItem $line */
        $line = CartItem::query()->firstOrNew([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
            'line_key' => self::lineKey($variant),
        ]);
        $newQty = ($line->exists ? $line->quantity : 0) + $qty;
        if (! $this->hasStock($product, $variant, $newQty)) {
            return response()->json(['message' => __('api.insufficient_stock')], 422);
        }
        $line->product_variant_id = $variant?->id;
        $line->quantity = $newQty;
        $line->save();
        $cart->touch();

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

        $variant = $this->resolveVariant($product, $request->input('variant_id', $request->input('product_variant_id')), false);
        $cart = $this->cartFor($request);
        $existing = $this->lineQuery($cart, $product, $variant)->first();
        if (! $existing && ! $variant) {
            // Older clients address variant lines by product id only.
            $existing = CartItem::query()->where('cart_id', $cart->id)->where('product_id', $product->id)->first();
            $variant = $existing?->variant;
        }

        $qty = (int) $data['quantity'];
        if ($qty === 0) {
            $existing?->delete();
            $cart->touch();

            return $this->respond($cart);
        }

        abort_unless(
            $product->status === 'publish' && ! $product->is_hidden && $product->is_available && ! $product->is_sold_out,
            422
        );
        if (! $this->hasStock($product, $variant, $qty)) {
            return response()->json(['message' => __('api.insufficient_stock')], 422);
        }

        $line = $existing ?? new CartItem([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
            'product_variant_id' => $variant?->id,
            'line_key' => self::lineKey($variant),
        ]);
        $line->quantity = $qty;
        $line->save();
        $cart->touch();

        return $this->respond($cart);
    }

    public function saveForLater(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        abort_if($product->tenant_id !== $user->tenant_id, 403);
        $cart = $this->cartFor($request);
        $variant = $this->resolveVariant($product, $request->input('variant_id', $request->input('product_variant_id')), false);
        $line = $this->lineQuery($cart, $product, $variant)->first();
        if ($line) {
            $meta = is_array($line->meta) ? $line->meta : [];
            $meta['save_for_later'] = true;
            $line->meta = $meta;
            $line->save();
        } else {
            CartItem::query()->create([
                'cart_id' => $cart->id,
                'product_id' => $product->id,
                'product_variant_id' => $variant?->id,
                'line_key' => self::lineKey($variant),
                'quantity' => 1,
                'meta' => ['save_for_later' => true],
            ]);
        }

        return $this->respond($cart);
    }

    public function moveToCart(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        abort_if($product->tenant_id !== $user->tenant_id, 403);
        $cart = $this->cartFor($request);
        $variant = $this->resolveVariant($product, $request->input('variant_id', $request->input('product_variant_id')), false);
        $line = $this->lineQuery($cart, $product, $variant)->firstOrFail();
        $meta = is_array($line->meta) ? $line->meta : [];
        unset($meta['save_for_later']);
        $line->meta = $meta;
        $line->save();

        return $this->respond($cart);
    }

    public function savedForLater(Request $request): \Illuminate\Http\JsonResponse
    {
        $cart = $this->cartFor($request);
        $cart->load(['items.product', 'items.variant']);
        $items = $cart->items->filter(fn (CartItem $line) => ! empty($line->meta['save_for_later']))->values();

        return response()->json(['data' => ['items' => $items]]);
    }

    public function removeItem(Request $request, Product $product): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        abort_if($product->tenant_id !== $user->tenant_id, 403);

        $cart = $this->cartFor($request);
        $variantId = $request->input('variant_id', $request->input('product_variant_id'));
        $q = CartItem::query()->where('cart_id', $cart->id)->where('product_id', $product->id);
        if ($variantId) {
            $q->where('product_variant_id', (int) $variantId);
        }
        $q->delete();
        $cart->touch();

        return $this->respond($cart);
    }

    /** PUT /cart/lines/{line}: change one line (any variant) by its id. */
    public function setLineQuantity(Request $request, int $line): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['quantity' => ['required', 'integer', 'min:0', 'max:999']]);
        $cart = $this->cartFor($request);
        $row = CartItem::query()->where('cart_id', $cart->id)->whereKey($line)->with(['product', 'variant'])->firstOrFail();
        $qty = (int) $data['quantity'];
        if ($qty === 0) {
            $row->delete();
        } else {
            if (! $row->product || ! $this->hasStock($row->product, $row->variant, $qty)) {
                return response()->json(['message' => __('api.insufficient_stock')], 422);
            }
            $row->quantity = $qty;
            $row->save();
        }
        $cart->touch();

        return $this->respond($cart);
    }

    /** DELETE /cart/lines/{line} */
    public function removeLine(Request $request, int $line): \Illuminate\Http\JsonResponse
    {
        $cart = $this->cartFor($request);
        CartItem::query()->where('cart_id', $cart->id)->whereKey($line)->delete();
        $cart->touch();

        return $this->respond($cart);
    }

    public static function lineKey(?ProductVariant $variant): string
    {
        return $variant ? 'v'.$variant->id : 'base';
    }

    protected function lineQuery(Cart $cart, Product $product, ?ProductVariant $variant): \Illuminate\Database\Eloquent\Builder
    {
        $q = CartItem::query()->where('cart_id', $cart->id)->where('product_id', $product->id);

        return $variant ? $q->where('product_variant_id', $variant->id) : $q->whereNull('product_variant_id');
    }

    /**
     * A product with variants needs one: the requested id (must belong to the product and be in
     * stock) or, when adding without a choice, the default variant. Products without variants
     * take no variant.
     */
    protected function resolveVariant(Product $product, mixed $variantId, bool $forAdd): ?ProductVariant
    {
        $variants = ProductVariant::query()->where('product_id', $product->id);
        if ($variantId) {
            $variant = (clone $variants)->whereKey((int) $variantId)->first();
            if (! $variant) {
                throw \Illuminate\Validation\ValidationException::withMessages(['variant_id' => 'این گزینه برای این محصول وجود ندارد.']);
            }
            if ($forAdd && ($variant->stock_status === 'outofstock' || ($variant->manage_stock && (int) $variant->stock < 1))) {
                throw \Illuminate\Validation\ValidationException::withMessages(['variant_id' => 'این گزینه موجود نیست.']);
            }

            return $variant;
        }
        if (! $forAdd || ! (clone $variants)->exists()) {
            return null;
        }
        $default = (clone $variants)->where('is_default', true)->first();
        if ($default) {
            return $default;
        }
        throw \Illuminate\Validation\ValidationException::withMessages(['variant_id' => 'لطفا یکی از گزینه‌های محصول را انتخاب کنید.']);
    }

    protected function hasStock(Product $product, ?ProductVariant $variant, int $qty): bool
    {
        if ($variant && $variant->manage_stock) {
            return $variant->stock === null || $qty <= (int) $variant->stock;
        }

        return ! ($product->manage_stock && $product->stock !== null && $qty > (int) $product->stock);
    }

    protected function respond(Cart $cart, ?PurchaseTypeService $types = null): \Illuminate\Http\JsonResponse
    {
        $cart->load(['items.product', 'items.variant']);
        $types ??= PurchaseTypeService::forTenant($cart->tenant_id);
        $activeItems = $cart->items->reject(fn (CartItem $line) => ! empty($line->meta['save_for_later']));
        $payload = $cart->toArray();
        $payload['items'] = $activeItems->values()->all();
        $payload['pricing'] = $types->quote($activeItems);

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
        // Last activity = cart row OR any line (adding items used to leave cart.updated_at
        // stale, so the next GET wiped the line that had just been added).
        $lastItemAt = $cart->items()->max('updated_at');
        $last = $cart->updated_at;
        if ($lastItemAt) {
            $itemAt = \Carbon\Carbon::parse($lastItemAt);
            if (! $last || $itemAt->greaterThan($last)) {
                $last = $itemAt;
            }
        }
        if ($last && $last->greaterThan($cutoff)) {
            return;
        }
        if ($cart->items()->exists()) {
            $cart->items()->delete();
            $cart->touch();
        }
    }
}
