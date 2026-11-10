<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Services\Checkout\CheckoutFields;
use App\Services\Checkout\CheckoutFlowSettings;
use App\Services\Checkout\CheckoutQuote;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Pricing\PurchaseTypeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Stepped cart/checkout: config for the storefront, per-step validate + save, and totals
 * recalculated after every step. Order creation stays on POST /checkout (it falls back to the
 * values saved here), so a storefront can use the steps or a single page.
 */
class CheckoutStepsController extends Controller
{
    use ResolvesPublicTenant;

    /** Request keys accepted by each step (besides the configured field keys). */
    private const STEP_KEYS = [
        'address' => ['shipping_address', 'shipping_lat', 'shipping_lng', 'address_label', 'save_address', 'shipping_province_code', 'shipping_city_code'],
        'delivery_time' => [],
        'shipping' => [],
        'payment' => ['coupon_password', 'payment_method', 'mode'],
    ];

    public function __construct(
        protected CheckoutFlowSettings $flow,
        protected CheckoutQuote $quote,
        protected PaymentGatewaySettingsService $gateways,
    ) {}

    // ---------- admin ----------

    public function adminShow(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json(['data' => [
            'settings' => $this->flow->get($tid),
            'defaults' => CheckoutFlowSettings::defaults(),
            'configured' => CheckoutFields::configured($tid),
        ]]);
    }

    public function adminUpdate(Request $request): JsonResponse
    {
        $data = $request->validate(['data' => ['required', 'array']]);
        $saved = $this->flow->save((int) $request->user()->tenant_id, $data['data']);

        return response()->json(['data' => ['settings' => $saved, 'configured' => true]]);
    }

    // ---------- signed-in ----------

    public function config(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->configPayload((int) $request->user()->tenant_id, $request->query('mode'))]);
    }

    public function session(Request $request): JsonResponse
    {
        $user = $request->user();
        $cart = $this->userCart($user);
        $saved = (array) ($cart?->meta['checkout'] ?? []);
        $lines = $cart ? $this->cartLines($cart) : collect();

        return response()->json(['data' => [
            'values' => $saved,
            'completed' => array_values((array) ($cart?->meta['checkout_steps'] ?? [])),
            'totals' => $lines->isEmpty() ? null : $this->quote->compute((int) $user->tenant_id, $lines, $saved, (int) $user->id),
        ]]);
    }

    public function step(Request $request, string $step): JsonResponse
    {
        $user = $request->user();
        $tid = (int) $user->tenant_id;
        abort_unless(in_array($step, CheckoutFlowSettings::STEPS, true), 404);
        $cart = $this->userCart($user);
        $lines = $cart ? $this->cartLines($cart) : collect();
        if ($lines->isEmpty()) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }
        $cfg = $this->flow->get($tid);
        $input = $this->stepInput($request, $cfg, $step);
        $values = array_merge((array) ($cart->meta['checkout'] ?? []), $input);

        $totals = $this->validateAndQuote($tid, $cfg, $step, $values, $lines, (int) $user->id);

        $meta = (array) ($cart->meta ?? []);
        $meta['checkout'] = $values;
        $meta['checkout_steps'] = array_values(array_unique(array_merge((array) ($meta['checkout_steps'] ?? []), [$step])));
        $cart->forceFill(['meta' => $meta])->save();

        return response()->json(['data' => [
            'step' => $step,
            'valid' => true,
            'values' => $values,
            'next_step' => $this->nextStep($cfg, $step, $totals),
            'totals' => $totals,
        ]]);
    }

    // ---------- guest ----------

    public function guestConfig(Request $request): JsonResponse
    {
        $tid = app(PublicShopCheckoutController::class)->guestTenant($request);

        return response()->json(['data' => $this->configPayload($tid, $request->query('mode')) + ['guest_checkout' => true]]);
    }

    public function guestStep(Request $request, string $step): JsonResponse
    {
        $controller = app(PublicShopCheckoutController::class);
        $tid = $controller->guestTenant($request);
        abort_unless(in_array($step, CheckoutFlowSettings::STEPS, true), 404);
        $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', 'min:1'],
            'items.*.quantity' => ['nullable', 'integer', 'min:1', 'max:999'],
            'items.*.variant_id' => ['nullable', 'integer', 'min:1'],
            'values' => ['nullable', 'array'],
            'guest_token' => ['nullable', 'string', 'max:64'],
        ]);
        $lines = $controller->guestLines($tid, (array) $request->input('items'), $request->input('guest_token') ? 'guest-shop:'.$request->input('guest_token') : null);
        if (! $lines) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }
        $cfg = $this->flow->get($tid);
        // Guests have no server cart: earlier steps' values come back in "values".
        $values = array_merge((array) $request->input('values', []), $this->stepInput($request, $cfg, $step));
        $totals = $this->validateAndQuote($tid, $cfg, $step, $values, $lines, null);

        return response()->json(['data' => [
            'step' => $step,
            'valid' => true,
            'values' => $values,
            'next_step' => $this->nextStep($cfg, $step, $totals),
            'totals' => $totals,
        ]]);
    }

    // ---------- helpers ----------

    /** @return array<string, mixed> */
    protected function configPayload(int $tid, mixed $mode): array
    {
        $cfg = $this->flow->get($tid);
        $mode = is_string($mode) && in_array($mode, ['cash', 'installment'], true) ? $mode : null;
        $rows = $this->gateways->checkoutGateways($tid, $mode);
        $hidden = array_map('strval', (array) ($cfg['payment']['hidden_gateways'] ?? []));
        $order = array_values(array_map('strval', (array) ($cfg['payment']['gateway_order'] ?? [])));
        $rows = array_values(array_filter($rows, fn ($r) => ! in_array((string) $r['id'], $hidden, true)));
        if ($order !== []) {
            usort($rows, function ($a, $b) use ($order) {
                $ia = array_search((string) $a['id'], $order, true);
                $ib = array_search((string) $b['id'], $order, true);

                return ($ia === false ? PHP_INT_MAX : $ia) <=> ($ib === false ? PHP_INT_MAX : $ib);
            });
        }
        $types = PurchaseTypeService::forTenant($tid);

        return CheckoutFlowSettings::publicPayload($cfg) + [
            'gateways' => $rows,
            'pricing' => ['single_price' => ! $types->active()],
        ];
    }

    /** @return array<string, mixed> */
    protected function stepInput(Request $request, array $cfg, string $step): array
    {
        $keys = array_merge(array_column($cfg['fields'][$step] ?? [], 'key'), self::STEP_KEYS[$step] ?? []);
        $keys = array_diff($keys, ['location', 'order_summary', 'terms']);
        if ($step === 'payment') {
            $keys[] = 'terms_accepted';
        }
        $out = [];
        foreach ($keys as $k) {
            if ($request->exists($k)) {
                $v = $request->input($k);
                if (is_string($v)) {
                    $v = mb_substr(trim($v), 0, 500);
                }
                $out[$k] = $v;
            }
        }
        if (array_key_exists('shipping_instance_id', $out)) {
            $out['shipping_instance_id'] = $out['shipping_instance_id'] ? (int) $out['shipping_instance_id'] : null;
        }

        return $out;
    }

    /** @return array<string, mixed> */
    protected function validateAndQuote(int $tid, array $cfg, string $step, array $values, Collection $lines, ?int $userId): array
    {
        $totals = $this->quote->compute($tid, $lines, $values, $userId);
        $rate = null;
        if (! empty($values['shipping_instance_id'])) {
            $rate = collect($totals['shipping_rates'])->firstWhere('instance_id', (int) $values['shipping_instance_id']);
        }
        $errors = CheckoutFields::errors($cfg, $step, $values, $rate, true);
        if ($step === 'shipping') {
            if (! empty($values['shipping_instance_id']) && ! $rate) {
                $errors['shipping_instance_id'] = 'این روش ارسال برای آدرس شما در دسترس نیست.';
            } elseif (empty($values['shipping_instance_id']) && $totals['shipping_rates'] !== []) {
                $errors['shipping_instance_id'] = 'روش ارسال را انتخاب کنید.';
            }
        }
        if ($step === 'payment') {
            if (! empty($values['coupon_code']) && $totals['coupon_error']) {
                $errors['coupon_code'] = (string) $totals['coupon_error'];
            }
            if (! empty($values['gift_card_code']) && $totals['gift_card_error']) {
                $errors['gift_card_code'] = (string) $totals['gift_card_error'];
            }
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $totals;
    }

    protected function nextStep(array $cfg, string $step, array $totals): ?string
    {
        $steps = array_values(array_filter($cfg['steps'], fn ($s) => $s['enabled']));
        usort($steps, fn ($a, $b) => $a['order'] <=> $b['order']);
        $keys = array_column($steps, 'key');
        $i = array_search($step, $keys, true);
        for ($j = ($i === false ? -1 : $i) + 1; $j < count($keys); $j++) {
            // Delivery time is skipped when it does not apply to the picked shipping method.
            if ($keys[$j] === 'delivery_time' && $totals['shipping'] !== null && ! $totals['delivery_time_required']) {
                continue;
            }

            return $keys[$j];
        }

        return null;
    }

    protected function userCart($user): ?Cart
    {
        return Cart::query()->where(['tenant_id' => $user->tenant_id, 'user_id' => $user->id])->first();
    }

    /** @return Collection<int, CartItem> */
    protected function cartLines(Cart $cart): Collection
    {
        return CartItem::query()->where('cart_id', $cart->id)->with(['product', 'variant'])->get()
            ->reject(fn (CartItem $l) => ! empty($l->meta['save_for_later']) || ! $l->product)->values();
    }
}
