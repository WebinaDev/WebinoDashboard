<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Services\Orders\OrderStock;
use App\Services\Orders\OrderStatusService;
use App\Services\Orders\OrderTax;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Pricing\PurchaseTypeService;
use App\Services\Shipping\ShippingZonesService;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Public (guest) shop checkout when tenant allows guest_checkout.
 * No real SMS; online gateways stay disabled until merchant credentials exist.
 */
class PublicShopCheckoutController extends Controller
{
    use ResolvesPublicTenant;

    public function __construct(
        protected ShippingZonesService $shipping,
        protected PaymentGatewaySettingsService $gateways,
    ) {}

    public function options(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->requireGuestCheckout($request);
        $mode = $request->query('mode');
        $mode = is_string($mode) && in_array($mode, ['cash', 'installment'], true) ? $mode : 'cash';
        $base = $request->query('total_minor');
        $rows = $this->gateways->checkoutGateways($tid, $mode, is_numeric($base) ? max(0, (int) $base) : 0);

        return response()->json(['gateways' => $rows, 'guest_checkout' => true]);
    }

    public function regions(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->requireGuestCheckout($request);
        $state = (string) $request->query('state_code', '');
        $cfg = $this->shipping->getConfig($tid);

        return response()->json(['data' => [
            'states' => ShippingZonesService::IR_STATES,
            'cities' => $state !== '' ? $this->shipping->citiesFor($tid, $state) : [],
            'show_map' => (bool) ($cfg['global']['show_map'] ?? false),
            'require_city' => (bool) ($cfg['global']['require_city'] ?? false),
            'districts' => ShippingZonesService::sanitizeDistricts($cfg['global']['districts'] ?? []),
            'professional_packaging' => ShippingZonesService::sanitizeProfessionalPackaging($cfg['global']['professional_packaging'] ?? []),
        ]]);
    }

    public function quote(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->requireGuestCheckout($request);
        $data = $request->validate([
            'state_code' => ['nullable', 'string', 'max:32'],
            'postcode' => ['nullable', 'string', 'max:20'],
            'city' => ['nullable', 'string', 'max:80'],
            'cart_subtotal_minor' => ['nullable', 'integer', 'min:0'],
            'items' => ['nullable', 'array', 'max:100'],
            'items.*.product_id' => ['required_with:items', 'integer', 'min:1'],
            'items.*.quantity' => ['nullable', 'integer', 'min:1', 'max:999'],
            'items.*.variant_id' => ['nullable', 'integer', 'min:1'],
        ]);
        $subtotal = (int) ($data['cart_subtotal_minor'] ?? 0);
        $lines = $this->resolveProductLines($tid, $data['items'] ?? []);
        if ($lines !== null && $subtotal <= 0) {
            $subtotal = 0;
            foreach ($lines as $line) {
                $subtotal += $line->product->storefrontPriceMinor($line->variant) * (int) $line->quantity;
            }
        }
        $rates = $this->shipping->quote(
            $tid,
            $data['state_code'] ?? null,
            $data['postcode'] ?? null,
            $subtotal,
            $data['city'] ?? null,
            $lines
        );

        return response()->json(['rates' => $rates]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->requireGuestCheckout($request);
        $phoneRequired = \App\Services\Checkout\CheckoutFields::addressFieldRequired($tid, 'customer_phone', true);
        $nameRequired = \App\Services\Checkout\CheckoutFields::addressFieldRequired($tid, 'recipient_name', true);
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
            'items.*.variant_id' => ['nullable', 'integer', 'min:1'],
            'coupon_code' => ['nullable', 'string', 'max:64'],
            'coupon_password' => ['nullable', 'string', 'max:191'],
            'gift_card_code' => ['nullable', 'string', 'max:40'],
            'delivery_date' => ['nullable', 'date_format:Y-m-d'],
            'delivery_slot' => ['nullable', 'string', 'max:40'],
            'shipping_plaque' => ['nullable', 'string', 'max:32'],
            'shipping_unit' => ['nullable', 'string', 'max:32'],
            'terms_accepted' => ['nullable', 'boolean'],
            'shipping_address' => ['nullable', 'string', 'max:2000'],
            'customer_phone' => [$phoneRequired ? 'required' : 'nullable', 'string', 'max:32'],
            'customer_note' => ['nullable', 'string', 'max:500'],
            'recipient_name' => [$nameRequired ? 'required' : 'nullable', 'string', 'max:255'],
            'shipping_instance_id' => ['nullable', 'integer', 'min:1'],
            'shipping_state_code' => ['nullable', 'string', 'max:32'],
            'shipping_postcode' => ['nullable', 'string', 'max:20'],
            'shipping_city' => ['nullable', 'string', 'max:80'],
            'shipping_district' => ['nullable', 'string', 'max:80'],
            'address_line' => ['nullable', 'string', 'max:500'],
            'professional_packaging' => ['nullable', 'boolean'],
            'customer_national_id' => ['nullable', 'string', 'max:20'],
            'guest_token' => ['nullable', 'string', 'max:64'],
        ]);

        $phoneRaw = trim((string) ($data['customer_phone'] ?? ''));
        $phone = $phoneRaw !== '' ? $this->normalizePhone($phoneRaw) : '';
        if ($phoneRequired && $phone === '') {
            throw ValidationException::withMessages(['customer_phone' => $phoneRaw === '' ? 'لطفا «شماره موبایل» را وارد کنید.' : 'شماره موبایل معتبر نیست.']);
        }
        if ($phoneRaw !== '' && $phone === '') {
            throw ValidationException::withMessages(['customer_phone' => 'شماره موبایل معتبر نیست.']);
        }

        $guestToken = trim((string) ($data['guest_token'] ?? '')) ?: Str::random(40);
        $lines = $this->resolveProductLines($tid, $data['items'], $guestToken);
        if ($lines === null || $lines->isEmpty()) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }

        $types = PurchaseTypeService::forTenant($tid);
        ['type' => $purchaseType, 'months' => $months] = $types->cartType($lines);
        $payToken = Str::random(40);

        $order = DB::transaction(function () use ($tid, $data, $lines, $types, $purchaseType, $months, $phone, $guestToken, $payToken) {
            app(OrderStock::class)->assertLinesAvailable($lines);

            $subtotal = 0;
            $unitPrices = [];
            $linePayload = [];
            foreach ($lines as $line) {
                $product = $line->product;
                if (! $product || $product->status !== 'publish' || $product->is_hidden || ! $product->is_available || $product->is_sold_out) {
                    throw ValidationException::withMessages(['cart' => 'cart_not_for_sale']);
                }
                if ($line->product_variant_id && ! $line->variant) {
                    throw ValidationException::withMessages(['cart' => 'cart_not_for_sale']);
                }
                $unit = $types->unitPrice($product, $purchaseType, $months, $line->variant);
                $unitPrices[$line->id] = $unit;
                $subtotal += $line->quantity * $unit;
                $linePayload[] = ['product_id' => $line->product_id, 'product_variant_id' => $line->product_variant_id, 'unit_price_minor' => $unit, 'quantity' => $line->quantity];
            }

            // Coupon (typed code, else the best automatic offer), same rules as signed-in checkout.
            $discount = 0;
            $applied = null;
            $coupons = app(\App\Services\Coupons\CouponService::class);
            if (! empty($data['coupon_code'])) {
                $applied = $coupons->apply($tid, $data['coupon_code'], $subtotal, $linePayload, null, 'site', [], $data['coupon_password'] ?? null);
            } else {
                $applied = $coupons->bestAutoApply($tid, $subtotal, $linePayload, null, 'site');
            }
            if ($applied) {
                $discount = (int) $applied['discount_minor'];
            }

            $stateCode = $data['shipping_state_code'] ?? null;
            $postcode = $data['shipping_postcode'] ?? null;
            $city = $data['shipping_city'] ?? null;
            $rates = $this->shipping->quote($tid, $stateCode, $postcode, max(0, $subtotal - $discount), $city, $lines);
            $picked = null;
            if (! empty($data['shipping_instance_id'])) {
                foreach ($rates as $rate) {
                    if ((int) $rate['instance_id'] === (int) $data['shipping_instance_id']) {
                        $picked = $rate;
                        break;
                    }
                }
                if ($picked === null) {
                    throw ValidationException::withMessages(['shipping_instance_id' => 'روش ارسال معتبر نیست.']);
                }
            } elseif ($rates !== []) {
                $picked = $rates[0];
            } elseif ($this->shipping->hasConfiguredMethods($tid)) {
                throw ValidationException::withMessages(['shipping_instance_id' => 'روش ارسال را انتخاب کنید.']);
            }

            $shippingMinor = $picked ? (int) $picked['cost_minor'] : 0;
            $shippingMeta = [
                'guest_checkout' => true,
                'guest_token' => $guestToken,
                'pay_token' => $payToken,
                'source' => 'guest_shop',
            ];
            if ($picked) {
                $shippingMeta['shipping_instance_id'] = $picked['instance_id'];
                $shippingMeta['shipping_method_id'] = $picked['method_id'];
                $shippingMeta['shipping_title'] = $picked['title'];
                $shippingMeta['shipping_zone_id'] = $picked['zone_id'];
                $shippingMeta['shipping_service'] = $picked['service'] ?? null;
                if (! empty($picked['packaging_minor'])) {
                    $shippingMeta['packaging_minor'] = (int) $picked['packaging_minor'];
                }
            }
            if (is_string($city) && $city !== '') {
                $shippingMeta['shipping_city'] = $city;
            }
            $district = trim((string) ($data['shipping_district'] ?? ''));
            if ($district !== '') {
                $shippingMeta['shipping_district'] = $district;
            }

            $proOpt = array_key_exists('professional_packaging', $data)
                ? (bool) $data['professional_packaging']
                : (bool) (ShippingZonesService::sanitizeProfessionalPackaging(
                    $this->shipping->getConfig($tid)['global']['professional_packaging'] ?? []
                )['default_selected']);
            $proPack = $this->shipping->professionalPackagingFee($tid, $proOpt);
            if ($proPack > 0) {
                $carton = $this->shipping->cartonReplacedByProfessional($tid, $proOpt, (int) ($shippingMeta['packaging_minor'] ?? 0));
                if ($carton > 0) {
                    $shippingMinor = max(0, $shippingMinor - $carton);
                    $shippingMeta['packaging_replaced_minor'] = $carton;
                }
                $shippingMinor += $proPack;
                $shippingMeta['professional_packaging_minor'] = $proPack;
            }

            $methodId = (string) ($picked['method_id'] ?? '');
            $freeRule = in_array($methodId, ['free_shipping', 'local_pickup'], true)
                || ! empty($applied['free_shipping']) || (int) ($applied['shipping_percent'] ?? 0) >= 100;
            if ($picked && $shippingMinor <= 0 && ! $freeRule) {
                throw ValidationException::withMessages(['shipping_minor' => 'هزینه ارسال نامعتبر است.']);
            }
            if ($applied) {
                $before = $shippingMinor;
                $shippingMinor = $coupons->shippingAfter($applied, $shippingMinor);
                if ($before !== $shippingMinor) {
                    $shippingMeta['coupon_shipping_discount_minor'] = $before - $shippingMinor;
                }
            }
            \App\Services\Checkout\CheckoutFields::enforce($tid, $data, $picked, $shippingMeta);

            $tax = OrderTax::compute($tid, max(0, $subtotal - $discount), $shippingMinor);
            if ($tax['lines'] !== []) {
                $shippingMeta['tax_lines'] = $tax['lines'];
                $shippingMeta['prices_include_tax'] = $tax['added_minor'] === 0;
            }

            $shippingAddress = $data['shipping_address']
                ?? trim(implode('، ', array_filter([
                    $data['recipient_name'] ?? null,
                    $city,
                    $data['address_line'] ?? null,
                    $postcode,
                ])));

            $order = Order::query()->create([
                'tenant_id' => $tid,
                'user_id' => null,
                'status' => 'pending_payment',
                'subtotal_minor' => $subtotal,
                'discount_minor' => $discount,
                'shipping_minor' => $shippingMinor,
                'tax_minor' => $tax['tax_minor'],
                'total_minor' => max(0, $subtotal - $discount + $shippingMinor + $tax['added_minor']),
                'coupon_code' => $applied ? $applied['coupon']->code : null,
                'coupon_id' => $applied ? $applied['coupon']->id : null,
                'currency' => $lines->first()->product->currency ?? 'IRT',
                'shipping_address' => $shippingAddress,
                'customer_phone' => $phone !== '' ? $phone : null,
                'customer_name' => trim((string) ($data['recipient_name'] ?? '')) ?: null,
                'customer_note' => $data['customer_note'] ?? null,
                'meta' => $shippingMeta,
            ]);

            foreach ($lines as $line) {
                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'product_id' => $line->product_id,
                    'product_variant_id' => $line->product_variant_id,
                    'product_name' => $line->variant ? trim($line->product->name.' - '.$line->variant->name) : $line->product->name,
                    'sku' => $line->variant?->sku ?: $line->product->sku,
                    'quantity' => $line->quantity,
                    'unit_price_minor' => $unitPrices[$line->id],
                    'purchase_type' => $purchaseType,
                    'meta' => $months ? ['wfcp_installment_months' => $months] : null,
                    'requires_login' => false,
                ]);
            }

            app(OrderStock::class)->sync($order, null, (string) $order->status);
            if ($applied) {
                $coupons->hold($applied['coupon'], $order, $discount, null);
            }
            CheckoutController::applyGiftCard($order, $data['gift_card_code'] ?? null, null);

            // Drop the temporary guest cart lines used for pricing/stock checks.
            $cartId = $lines->first()?->cart_id;
            if ($cartId) {
                CartItem::query()->where('cart_id', $cartId)->delete();
            }

            return $order->fresh()->load('items.product');
        });

        return response()->json([
            'data' => [
                'id' => $order->id,
                'number' => $order->number,
                'status' => $order->status,
                'subtotal_minor' => $order->subtotal_minor,
                'discount_minor' => $order->discount_minor,
                'shipping_minor' => $order->shipping_minor,
                'total_minor' => $order->total_minor,
                'gift_card_minor' => (int) (($order->meta ?? [])['gift_card']['amount_minor'] ?? 0),
                'currency' => $order->currency,
                'pay_token' => $payToken,
                'guest_token' => $guestToken,
                // Online payment for guests: POST /public/orders/{id}/pay/intent with token=pay_token.
                'pay_intent_url' => '/api/v1/public/orders/'.$order->id.'/pay/intent',
            ],
        ], 201);
    }

    public function confirmOffline(Request $request, OrderStatusService $statuses): \Illuminate\Http\JsonResponse
    {
        $tid = $this->requireGuestCheckout($request);
        $data = $request->validate([
            'order_id' => ['required', 'integer'],
            'provider' => ['required', 'string', 'in:cod,cheque,c2c'],
            'pay_token' => ['required', 'string', 'max:64'],
        ]);
        $provider = $data['provider'];
        if (! $this->gateways->isEnabled($tid, $provider)) {
            return response()->json(['message' => 'این روش پرداخت فعال نیست.'], 422);
        }
        $order = Order::query()->where('tenant_id', $tid)->whereKey($data['order_id'])->firstOrFail();
        $meta = is_array($order->meta) ? $order->meta : [];
        if (empty($meta['guest_checkout']) || empty($meta['pay_token']) || ! hash_equals((string) $meta['pay_token'], $data['pay_token'])) {
            abort(403, 'Invalid guest payment token.');
        }
        if (! in_array((string) $order->status, ['pending_payment', 'payment_failed'], true)) {
            return response()->json([
                'message' => 'وضعیت سفارش برای این پرداخت مناسب نیست.',
                'data' => ['id' => $order->id, 'status' => $order->status, 'number' => $order->number],
            ], 422);
        }

        $next = $provider === 'cod' ? 'processing' : 'on_hold';
        $meta['payment_method'] = $provider;
        $meta['offline_confirmed_at'] = now()->toIso8601String();
        $ok = $statuses->apply($order, $next, [
            'payment_provider' => $provider,
            'payment_tender' => $provider,
            'meta' => $meta,
        ]);
        if (! $ok) {
            return response()->json(['message' => 'تغییر وضعیت سفارش ممکن نشد.'], 422);
        }
        $fresh = $order->fresh();

        return response()->json([
            'data' => [
                'id' => $fresh->id,
                'number' => $fresh->number,
                'status' => $fresh->status,
                'payment_provider' => $fresh->payment_provider,
                'total_minor' => $fresh->total_minor,
                'currency' => $fresh->currency,
            ],
        ]);
    }

    /** Guest-checkout tenant (403 when guest checkout is off); used by the stepped checkout API. */
    public function guestTenant(Request $request): int
    {
        return $this->requireGuestCheckout($request);
    }

    /** @return \Illuminate\Support\Collection<int, CartItem>|null */
    public function guestLines(int $tenantId, array $items, ?string $guestToken = null): ?\Illuminate\Support\Collection
    {
        return $this->resolveProductLines($tenantId, $items, $guestToken);
    }

    protected function requireGuestCheckout(Request $request): int
    {
        $tid = $this->publicTenantId($request);
        $privacy = app(\App\Services\Modules\ModuleSettingsService::class)->get($tid, 'settings', 'site.privacy', [
            'guest_checkout' => false,
        ]);
        $shop = ShopSettings::getGeneral($tid);
        $allowed = ! empty($privacy['guest_checkout']) || ! empty($shop['guest_checkout']);
        abort_unless($allowed, 403, 'خرید مهمان برای این فروشگاه فعال نیست.');

        return $tid;
    }

    /**
     * Build real CartItem models on a temporary guest cart so pricing/stock helpers type-check.
     *
     * @param  list<array{product_id?: mixed, quantity?: mixed}>  $items
     * @return \Illuminate\Support\Collection<int, CartItem>|null
     */
    protected function resolveProductLines(int $tenantId, array $items, ?string $guestToken = null): ?\Illuminate\Support\Collection
    {
        if ($items === []) {
            return null;
        }
        $qtyByKey = [];
        foreach ($items as $row) {
            $pid = (int) ($row['product_id'] ?? 0);
            $vid = (int) ($row['variant_id'] ?? $row['product_variant_id'] ?? 0);
            $qty = max(1, min(999, (int) ($row['quantity'] ?? 1)));
            if ($pid <= 0) {
                continue;
            }
            $key = $pid.':'.$vid;
            $qtyByKey[$key] = ($qtyByKey[$key] ?? 0) + $qty;
        }
        if ($qtyByKey === []) {
            return null;
        }
        $pids = array_unique(array_map(fn ($k) => (int) explode(':', $k)[0], array_keys($qtyByKey)));
        $products = Product::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $pids)
            ->get()
            ->keyBy('id');
        $variants = \App\Models\ProductVariant::query()->whereIn('product_id', $pids)->get();
        $token = $guestToken ?: ('guest-shop:'.Str::random(24));
        $cart = Cart::query()->firstOrCreate(
            ['tenant_id' => $tenantId, 'user_id' => null, 'guest_token' => $token],
        );
        CartItem::query()->where('cart_id', $cart->id)->delete();
        $lines = collect();
        foreach ($qtyByKey as $key => $qty) {
            [$pid, $vid] = array_map('intval', explode(':', $key));
            $product = $products->get($pid);
            if (! $product) {
                continue;
            }
            $own = $variants->where('product_id', $pid);
            $variant = null;
            if ($vid > 0) {
                $variant = $own->firstWhere('id', $vid);
                if (! $variant) {
                    throw ValidationException::withMessages(['items' => 'این گزینه برای این محصول وجود ندارد.']);
                }
            } elseif ($own->isNotEmpty()) {
                $variant = $own->firstWhere('is_default', true);
                if (! $variant) {
                    throw ValidationException::withMessages(['items' => 'لطفا یکی از گزینه‌های محصول را انتخاب کنید.']);
                }
            }
            $line = new CartItem;
            $line->forceFill([
                'cart_id' => $cart->id,
                'product_id' => $pid,
                'product_variant_id' => $variant?->id,
                'line_key' => $variant ? 'v'.$variant->id : 'base',
                'quantity' => $qty,
            ])->save();
            $line->setRelation('product', $product);
            $line->setRelation('variant', $variant);
            $lines->push($line);
        }

        return $lines->isEmpty() ? null : $lines;
    }

    protected function normalizePhone(string $raw): string
    {
        $d = preg_replace('/\D+/', '', strtr($raw, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9']));
        if (str_starts_with((string) $d, '0098')) {
            $d = substr((string) $d, 4);
        } elseif (str_starts_with((string) $d, '98')) {
            $d = substr((string) $d, 2);
        }
        if (str_starts_with((string) $d, '9') && strlen((string) $d) === 10) {
            $d = '0'.$d;
        }

        return preg_match('/^09\d{9}$/', (string) $d) ? (string) $d : '';
    }
}
