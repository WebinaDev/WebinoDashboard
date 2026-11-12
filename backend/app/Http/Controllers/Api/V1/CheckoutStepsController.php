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
        $user = $request->user();

        return response()->json(['data' => $this->configPayload((int) $user->tenant_id, $request->query('mode'), $this->feeBase($request, (int) $user->tenant_id, $user))]);
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
        $preview = $this->isPreview($request, $step);
        $input = $this->stepInput($request, $cfg, $step);
        $values = array_merge((array) ($cart->meta['checkout'] ?? []), $input);

        [$totals, $errors] = $this->validateAndQuote($tid, $cfg, $step, $values, $lines, (int) $user->id, $preview);

        if (! $preview) {
            $meta = (array) ($cart->meta ?? []);
            $meta['checkout'] = $values;
            $meta['checkout_steps'] = array_values(array_unique(array_merge((array) ($meta['checkout_steps'] ?? []), [$step])));
            $cart->forceFill(['meta' => $meta])->save();
        }

        return $this->stepResponse($step, $values, $totals, $cfg, $preview, $errors);
    }

    // ---------- guest ----------

    public function guestConfig(Request $request): JsonResponse
    {
        $tid = app(PublicShopCheckoutController::class)->guestTenant($request);

        return response()->json(['data' => $this->configPayload($tid, $request->query('mode'), $this->feeBase($request, $tid, null)) + ['guest_checkout' => true]]);
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
            'preview' => ['nullable', 'boolean'],
        ]);
        $lines = $controller->guestLines($tid, (array) $request->input('items'), $request->input('guest_token') ? 'guest-shop:'.$request->input('guest_token') : null);
        if (! $lines) {
            return response()->json(['message' => __('api.cart_empty')], 422);
        }
        $cfg = $this->flow->get($tid);
        $preview = $this->isPreview($request, $step);
        // Guests have no server cart: earlier steps' values come back in "values".
        $values = array_merge((array) $request->input('values', []), $this->stepInput($request, $cfg, $step));
        [$totals, $errors] = $this->validateAndQuote($tid, $cfg, $step, $values, $lines, null, $preview);

        return $this->stepResponse($step, $values, $totals, $cfg, $preview, $errors);
    }

    // ---------- helpers ----------

    /** @return array<string, mixed> */
    protected function configPayload(int $tid, mixed $mode, int $baseMinor = 0): array
    {
        $cfg = $this->flow->get($tid);
        $mode = is_string($mode) && in_array($mode, ['cash', 'installment'], true) ? $mode : null;
        $rows = CheckoutFlowSettings::applyGatewayLayout($cfg, $this->gateways->checkoutGateways($tid, $mode, $baseMinor));
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

    /**
     * @return array{0: array<string, mixed>, 1: array<string, string>}
     */
    protected function validateAndQuote(int $tid, array $cfg, string $step, array $values, Collection $lines, ?int $userId, bool $preview = false): array
    {
        $totals = $this->quote->compute($tid, $lines, $values, $userId);
        $rate = null;
        if (! empty($values['shipping_instance_id'])) {
            $rate = collect($totals['shipping_rates'])->firstWhere('instance_id', (int) $values['shipping_instance_id']);
        }
        $virtual = ! ($totals['requires_shipping'] ?? true);
        $errors = ($virtual && $step !== 'payment') ? [] : CheckoutFields::errors($cfg, $step, $values, $rate, true);
        if ($step === 'shipping') {
            if (! empty($values['shipping_instance_id']) && ! $rate) {
                $errors['shipping_instance_id'] = 'این روش ارسال برای آدرس شما در دسترس نیست.';
            } elseif (empty($values['shipping_instance_id']) && $totals['shipping_rates'] !== []) {
                $errors['shipping_instance_id'] = 'روش ارسال را انتخاب کنید.';
            }
        }
        if ($step === 'payment') {
            if ($preview) {
                unset($errors['terms_accepted']);
            }
            if (! empty($values['coupon_code']) && $totals['coupon_error']) {
                $errors['coupon_code'] = (string) $totals['coupon_error'];
            }
            if (! empty($values['gift_card_code']) && $totals['gift_card_error']) {
                $errors['gift_card_code'] = (string) $totals['gift_card_error'];
            }
        }
        if ($errors !== [] && ! $preview) {
            throw ValidationException::withMessages($errors);
        }

        return [$totals, $errors];
    }

    /**
     * @param  array<string, mixed>  $values
     * @param  array<string, mixed>  $totals
     * @param  array<string, mixed>  $cfg
     * @param  array<string, string>  $errors
     */
    protected function stepResponse(string $step, array $values, array $totals, array $cfg, bool $preview, array $errors): \Illuminate\Http\JsonResponse
    {
        $payload = [
            'step' => $step,
            'valid' => $errors === [],
            'values' => $values,
            'next_step' => $this->nextStep($cfg, $step, $totals),
            'totals' => $totals,
        ];
        if ($preview) {
            $payload['preview'] = true;
            $payload['errors'] = (object) $errors;
        }

        return response()->json(['data' => $payload]);
    }

    protected function isPreview(Request $request, string $step): bool
    {
        if ($step !== 'payment') {
            return false;
        }
        $v = $request->input('preview', $request->query('preview'));

        return $v === true || $v === 1 || $v === '1' || $v === 'true';
    }

    /** Payable amount used to compute per-gateway fee_amount_minor (query total_minor, else current cart/session total). */
    protected function feeBase(Request $request, int $tid, mixed $user): int
    {
        $q = $request->query('total_minor');
        if (is_numeric($q)) {
            return max(0, (int) $q);
        }
        if ($user) {
            $cart = $this->userCart($user);
            $lines = $cart ? $this->cartLines($cart) : collect();
            if ($lines->isNotEmpty()) {
                $saved = (array) ($cart->meta['checkout'] ?? []);

                return (int) $this->quote->compute($tid, $lines, $saved, (int) $user->id)['total_minor'];
            }
        }

        return 0;
    }

    protected function nextStep(array $cfg, string $step, array $totals): ?string
    {
        $keys = CheckoutFlowSettings::stepKeys($cfg, is_array($totals['shipping'] ?? null) ? $totals['shipping'] : null, ($totals['shipping'] ?? null) !== null);
        $i = array_search($step, $keys, true);
        for ($j = ($i === false ? -1 : $i) + 1; $j < count($keys); $j++) {
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
