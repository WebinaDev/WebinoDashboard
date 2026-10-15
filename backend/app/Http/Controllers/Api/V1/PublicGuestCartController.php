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

    private const DIGITS = [
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
    ];

    public function show(Request $request, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $cart = $this->resolveCart($request);
        if (! $cart) {
            return response()->json(['data' => ['items' => [], 'guest_token' => null]]);
        }
        $cart->load(['items.product']);

        $fulfillment = (string) $request->query('fulfillment', 'dine_in');
        if (! in_array($fulfillment, ['dine_in', 'pickup', 'delivery'], true)) {
            $fulfillment = 'dine_in';
        }
        $lines = [];
        $count = 0;
        $cart->loadMissing('items.product.category');
        foreach ($cart->items as $line) {
            $meta = is_array($line->meta) ? $line->meta : [];
            $lines[] = [
                'amount' => (int) $line->quantity * (int) ($meta['unit_minor'] ?? $line->product?->price_minor ?? 0),
                'taxable' => \App\Services\Orders\OrderTax::productTaxable($line->product),
            ];
            $count += (int) $line->quantity;
        }

        return response()->json(['data' => array_merge($cart->toArray(), [
            'totals' => $ordering->quote($this->publicTenantId($request), $fulfillment, $lines, $count),
        ])]);
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

        $product = Product::query()->find($data['product_id']);
        if (
            ! $product
            || (int) $product->tenant_id !== $tid
            || $product->status !== 'publish'
            || $product->is_hidden
            || $product->is_available === false
            || $product->is_sold_out
        ) {
            return response()->json([
                'message' => __('api.cafe_item_unavailable'),
                'errors' => ['product_id' => [__('api.cafe_item_unavailable')]],
            ], 422);
        }

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

        // Normalise Persian/Arabic digits before validation.
        $request->merge(array_map(
            fn ($v) => is_string($v) ? strtr($v, self::DIGITS) : $v,
            $request->only(['customer_phone', 'postal_code', 'plaque', 'unit', 'table_number', 'pickup_time'])
        ));

        $status = $ordering->publicStatus($tid);
        $fulfillment = (string) $request->input('fulfillment', 'dine_in');
        $methods = array_column($status['payment_methods'], 'id');
        if (! $request->filled('payment_method') && in_array('cash', $methods, true)) {
            // Older clients (and table QR flows) without a picker pay at the counter.
            $request->merge(['payment_method' => 'cash']);
        }
        if (! $request->filled('fulfillment')) {
            $request->merge(['fulfillment' => 'dine_in']);
        }
        if (! $request->filled('idempotency_key')) {
            $request->merge(['idempotency_key' => 'auto-'.Str::random(24)]);
        }

        $meta = $request->validate([
            'idempotency_key' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],
            'guest_token' => ['nullable', 'string', 'max:64'],
            'branch_slug' => ['nullable', 'string', 'max:255'],
            'fulfillment' => ['required', 'string', 'in:dine_in,pickup,delivery'],
            'payment_method' => ['required', 'string', 'in:'.implode(',', $methods ?: ['none'])],
            'customer_name' => [$fulfillment === 'dine_in' ? 'nullable' : 'required', 'string', 'min:2', 'max:120'],
            'customer_phone' => [$fulfillment === 'dine_in' ? 'nullable' : 'required', 'string', 'regex:/^(\+98|0098|0)?9\d{9}$/'],
            'customer_note' => ['nullable', 'string', 'max:500'],
            'table_number' => [$fulfillment === 'dine_in' && $status['dine_in_require_table'] && ! $this->cartHasTable($request) ? 'required' : 'nullable', 'string', 'max:32'],
            'address' => [$fulfillment === 'delivery' ? 'required' : 'nullable', 'string', 'min:10', 'max:500'],
            'plaque' => [$fulfillment === 'delivery' ? 'required' : 'nullable', 'string', 'max:32'],
            'unit' => ['nullable', 'string', 'max:32'],
            'postal_code' => ['nullable', 'string', 'regex:/^\d{10}$/'],
            'lat' => [$fulfillment === 'delivery' && $status['delivery_require_pin'] ? 'required' : 'nullable', 'numeric', 'between:24,40'],
            'lng' => [$fulfillment === 'delivery' && $status['delivery_require_pin'] ? 'required' : 'nullable', 'numeric', 'between:44,64'],
            'pickup_time' => [$fulfillment === 'pickup' ? 'required' : 'nullable', 'string', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
        ], [
            'customer_phone.regex' => __('api.cafe_phone_invalid'),
            'postal_code.regex' => __('api.cafe_postal_invalid'),
            'lat.required' => __('api.cafe_pin_required'),
            'lng.required' => __('api.cafe_pin_required'),
        ]);

        if (! ($status['fulfillment'][$fulfillment] ?? false)) {
            return response()->json(['message' => __('api.cafe_fulfillment')], 422);
        }

        if ($fulfillment === 'dine_in') {
            $cartRow = $this->resolveCart($request, $request->only(['guest_token']));
            $typed = trim((string) ($meta['table_number'] ?? ''));
            $wanted = $typed !== '' ? $typed : (string) ($cartRow?->table_number ?? '');
            if ($wanted !== '') {
                $table = $ordering->resolveTable($this->publicTenantId($request), $wanted);
                if (! $table) {
                    return response()->json([
                        'message' => __('api.cafe_table_invalid'),
                        'errors' => ['table_number' => [__('api.cafe_table_invalid')]],
                    ], 422);
                }
                $meta['table_number'] = $table['code'];
            }
        }

        if ($fulfillment === 'delivery' && $status['delivery_radius_km'] > 0 && $status['cafe_location'] && isset($meta['lat'], $meta['lng'])) {
            $km = CafeOrdering::distanceKm($status['cafe_location']['lat'], $status['cafe_location']['lng'], (float) $meta['lat'], (float) $meta['lng']);
            if ($km > $status['delivery_radius_km']) {
                return response()->json([
                    'message' => __('api.cafe_out_of_zone'),
                    'errors' => ['lat' => [__('api.cafe_out_of_zone')]],
                ], 422);
            }
        }

        $pickupAt = null;
        // Pickup needs a slot; delivery may pick one (empty = as soon as possible). Either way only
        // offered slots inside opening hours are accepted.
        if ($fulfillment === 'pickup' || ($fulfillment === 'delivery' && ! empty($meta['pickup_time']))) {
            // Only offered slots are accepted: after prep time and inside opening hours.
            $slot = collect($ordering->pickupSlots($tid))->firstWhere('time', $meta['pickup_time']);
            if (! $slot) {
                return response()->json([
                    'message' => __('api.cafe_pickup_unavailable'),
                    'errors' => ['pickup_time' => [__('api.cafe_pickup_unavailable')]],
                ], 422);
            }
            $pickupAt = \Carbon\Carbon::parse($slot['at']);
        }

        $phone = isset($meta['customer_phone']) ? '0'.substr(preg_replace('/\D/', '', $meta['customer_phone']), -10) : null;
        $token = $meta['guest_token'] ?? null;

        // Idempotent: same key on the same tenant returns the order already created.
        $lock = \Illuminate\Support\Facades\Cache::lock('cafe-checkout:'.$tid.':'.$meta['idempotency_key'], 15);
        if (! $lock->get()) {
            return response()->json(['message' => __('api.cafe_checkout_in_progress')], 409);
        }
        try {
            $existing = Order::query()->where('tenant_id', $tid)
                ->where('meta->idempotency_key', $meta['idempotency_key'])->first();
            if ($existing) {
                return response()->json(['data' => $this->presentOrder($existing->load('items.product'))]);
            }

            $cart = $this->resolveCart($request, $meta, true);
            $lines = CartItem::query()->where('cart_id', $cart->id)->with(['product.modifiers', 'product.category'])->get();
            if ($lines->isEmpty()) {
                return response()->json(['message' => __('api.cart_empty')], 422);
            }
            foreach ($lines as $line) {
                $product = $line->product;
                if (! $product || $product->status !== 'publish' || $product->is_hidden || ! $product->is_available || $product->is_sold_out) {
                    return response()->json(['message' => __('api.cafe_item_unavailable'), 'errors' => ['code' => ['cart_not_for_sale']]], 422);
                }
            }

            $online = $meta['payment_method'] !== 'cash';

            $order = DB::transaction(function () use ($lines, $tid, $meta, $cart, $ordering, $fulfillment, $phone, $token, $online, $pickupAt, $request) {
                app(OrderStock::class)->assertLinesAvailable($lines);

                $pricedLines = [];
                $quoteLines = [];
                $itemCount = 0;
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
                    $taxable = \App\Services\Orders\OrderTax::productTaxable($line->product);
                    $pricedLines[] = [$line, $priced, $taxable];
                    $quoteLines[] = ['amount' => $line->quantity * $priced['unit_minor'], 'taxable' => $taxable];
                    $itemCount += (int) $line->quantity;
                }

                $quote = $ordering->quote($tid, $fulfillment, $quoteLines, $itemCount);
                $metaOrder = [
                    'source' => 'guest_table',
                    'guest_token' => is_string($token) ? $token : $cart->guest_token,
                    'idempotency_key' => $meta['idempotency_key'],
                    'fulfillment' => $fulfillment,
                    'kitchen_status' => 'new',
                    'packaging_included' => $quote['packaging_minor'] > 0,
                    'fees' => [
                        'packaging_minor' => $quote['packaging_minor'],
                        'delivery_minor' => $quote['delivery_minor'],
                        'service_minor' => $quote['service_minor'],
                        'total_minor' => $quote['fees_minor'],
                    ],
                    'payment_method' => $meta['payment_method'],
                    'pay_token' => Str::random(40),
                    'return_url' => $this->returnUrl($request),
                    'vat' => [
                        'rate' => $quote['vat_rate'],
                        'inclusive' => $quote['vat_inclusive'],
                        'show' => $quote['show_vat'],
                        'amount_minor' => $quote['tax_minor'],
                    ],
                ];
                if ($quote['tax_lines'] !== []) {
                    $metaOrder['tax_lines'] = $quote['tax_lines'];
                    $metaOrder['prices_include_tax'] = $quote['vat_inclusive'];
                }
                if ($fulfillment === 'delivery') {
                    $metaOrder['delivery'] = [
                        'address' => $meta['address'] ?? null,
                        'plaque' => $meta['plaque'] ?? null,
                        'unit' => $meta['unit'] ?? null,
                        'postal_code' => $meta['postal_code'] ?? null,
                        'lat' => isset($meta['lat']) ? (float) $meta['lat'] : null,
                        'lng' => isset($meta['lng']) ? (float) $meta['lng'] : null,
                    ];
                }
                if ($pickupAt) {
                    $metaOrder[$fulfillment === 'delivery' ? 'delivery_at' : 'pickup_at'] = $pickupAt->toIso8601String();
                }

                $address = $fulfillment === 'delivery'
                    ? trim(implode('، ', array_filter([
                        $meta['address'] ?? null,
                        isset($meta['plaque']) ? 'پلاک '.$meta['plaque'] : null,
                        ! empty($meta['unit']) ? 'واحد '.$meta['unit'] : null,
                        ! empty($meta['postal_code']) ? 'کد پستی '.$meta['postal_code'] : null,
                    ])))
                    : null;

                $order = Order::query()->create([
                    'tenant_id' => $tid,
                    'user_id' => $request->user('sanctum')?->tenant_id === $tid ? $request->user('sanctum')->id : null,
                    // Online orders wait for verified payment; cash orders go straight to the kitchen.
                    'status' => $online ? 'pending_payment' : 'processing',
                    'subtotal_minor' => $quote['subtotal_minor'],
                    'discount_minor' => 0,
                    'shipping_minor' => $quote['fees_minor'],
                    'tax_minor' => $quote['tax_minor'],
                    'total_minor' => $quote['grand_total_minor'],
                    'currency' => $lines->first()->product->currency,
                    'customer_name' => $meta['customer_name'] ?? null,
                    'customer_phone' => $phone,
                    'customer_note' => $meta['customer_note'] ?? null,
                    'shipping_address' => $address,
                    'table_number' => $fulfillment === 'dine_in' ? ($meta['table_number'] ?? $cart->table_number) : null,
                    'branch_slug' => $meta['branch_slug'] ?? $cart->branch_slug,
                    'payment_tender' => $online ? null : 'cash',
                    'meta' => $metaOrder,
                ]);

                foreach ($pricedLines as [$line, $priced, $taxable]) {
                    \App\Models\OrderItem::query()->create([
                        'order_id' => $order->id,
                        'product_id' => $line->product_id,
                        'product_variant_id' => $priced['variant_id'],
                        'product_name' => $line->product->name,
                        'quantity' => $line->quantity,
                        'unit_price_minor' => $priced['unit_minor'],
                        'meta' => ['selections' => $priced['selections'], 'vat_applicable' => $taxable],
                    ]);
                }

                app(\App\Services\Orders\OrderLifecycle::class)->sync($order->fresh(), null);
                CartItem::query()->where('cart_id', $cart->id)->delete();

                return $order->fresh()->load('items.product');
            });

            $payload = $this->presentOrder($order);
            if ($online) {
                $payload['payment'] = $this->startPayment($order, $meta['payment_method']);
            }

            return response()->json(['data' => $payload], 201);
        } finally {
            $lock->release();
        }
    }

    /** Validate a table from a QR link (by id or code) so the menu can prefill dine-in. */
    public function table(Request $request, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $id = (int) $request->query('table_id', 0);
        $code = $request->query('table');
        $table = $ordering->resolveTable($this->publicTenantId($request), is_string($code) ? $code : null, $id > 0 ? $id : null);
        if (! $table) {
            return response()->json(['message' => __('api.cafe_table_invalid')], 404)->header('Cache-Control', 'no-store');
        }

        return response()->json(['data' => $table])->header('Cache-Control', 'no-store');
    }

    public function pickupSlots(Request $request, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $ordering->pickupSlots($this->publicTenantId($request))])
            ->header('Cache-Control', 'no-store');
    }

    /** Retry online payment for a pending guest order (same guest token + pay token). */
    public function pay(Request $request, int $order, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate([
            'pay_token' => ['required', 'string', 'max:64'],
            'provider' => ['required', 'string', 'max:32'],
        ]);
        $row = Order::query()->where('tenant_id', $tid)->whereKey($order)->firstOrFail();
        $meta = is_array($row->meta) ? $row->meta : [];
        abort_unless(($meta['source'] ?? null) === 'guest_table', 404);
        if (! hash_equals((string) ($meta['pay_token'] ?? ''), $data['pay_token'])) {
            abort(403);
        }
        if (! in_array($row->status, ['pending_payment', 'payment_failed', 'awaiting_gateway'], true)) {
            return response()->json(['message' => __('api.cafe_order_not_payable')], 422);
        }
        $online = array_column(array_filter($ordering->paymentMethods($tid), fn ($m) => $m['type'] === 'online'), 'id');
        if (! in_array($data['provider'], $online, true)) {
            return response()->json(['message' => __('api.cafe_gateway_unavailable')], 422);
        }

        return response()->json(['data' => $this->startPayment($row, $data['provider'])]);
    }

    /** @return array<string, mixed> */
    private function startPayment(Order $order, string $provider): array
    {
        try {
            $intent = app(\App\Services\Payments\PaymentCheckoutService::class)->createIntent($order, $provider);
        } catch (\App\Services\Orders\StockUnavailableException $e) {
            return ['ok' => false, 'code' => 'stock_unavailable', 'message' => $e->getMessage()];
        } catch (\Throwable $e) {
            report($e);

            return ['ok' => false, 'message' => __('api.cafe_gateway_error')];
        }
        $order->update(['payment_provider' => $provider, 'status' => 'awaiting_gateway']);

        return ['ok' => true, 'redirect_url' => $intent->redirect_url, 'provider' => $provider];
    }

    private function cartHasTable(Request $request): bool
    {
        $cart = $this->resolveCart($request, $request->only(['guest_token']));

        return $cart !== null && is_string($cart->table_number) && $cart->table_number !== ''
            && app(CafeOrdering::class)->resolveTable((int) $cart->tenant_id, $cart->table_number) !== null;
    }

    /** Where the gateway callback sends the guest back: this site's menu, never a client-supplied URL. */
    private function returnUrl(Request $request): string
    {
        return $request->getSchemeAndHttpHost().'/catalogue';
    }

    /** @return array<string, mixed> */
    private function presentOrder(Order $order): array
    {
        $meta = is_array($order->meta) ? $order->meta : [];

        return [
            'id' => $order->id,
            'number' => $order->number ?? $order->id,
            'status' => $order->status,
            'fulfillment' => $meta['fulfillment'] ?? null,
            'table_number' => $order->table_number,
            'customer_phone' => $order->customer_phone,
            'payment_method' => $meta['payment_method'] ?? null,
            'pay_token' => in_array($order->status, ['pending_payment', 'payment_failed', 'awaiting_gateway'], true) ? ($meta['pay_token'] ?? null) : null,
            'subtotal_minor' => (int) $order->subtotal_minor,
            'fees' => $meta['fees'] ?? null,
            'shipping_minor' => (int) $order->shipping_minor,
            'tax_minor' => (int) $order->tax_minor,
            'total_minor' => (int) $order->total_minor,
            'vat' => $meta['vat'] ?? null,
            'currency' => $order->currency,
            'items' => $order->items->map(fn ($it) => [
                'product_name' => $it->product_name,
                'quantity' => $it->quantity,
                'unit_price_minor' => $it->unit_price_minor,
            ])->values()->all(),
        ];
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
        // Only a table staff manage (or any label when the cafe has none) sticks to the cart.
        $resolved = is_string($table) && $table !== '' ? app(CafeOrdering::class)->resolveTable($tid, $table) : null;

        $cart = Cart::query()->firstOrCreate(
            ['tenant_id' => $tid, 'guest_token' => $token],
            [
                'user_id' => null,
                'table_number' => $resolved['code'] ?? null,
                'branch_slug' => is_string($branch) && $branch !== '' ? $branch : ($resolved['branch_slug'] ?? null),
            ],
        );
        // Scanning another table's QR moves the cart to that table.
        if ($resolved && ! $cart->wasRecentlyCreated && $cart->table_number !== $resolved['code']) {
            $cart->update(['table_number' => $resolved['code']]);
        }

        return $cart;
    }
}
