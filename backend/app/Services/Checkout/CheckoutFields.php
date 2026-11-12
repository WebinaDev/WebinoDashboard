<?php

namespace App\Services\Checkout;

use Illuminate\Validation\ValidationException;

/**
 * Server-side checks for the stepped checkout settings, shared by signed-in and guest checkout
 * and by the per-step validate endpoints.
 *
 * Required address fields are enforced once the merchant has saved the checkout flow settings
 * (older storefronts that send only a free-text address keep working until then). Delivery time
 * and terms are enforced whenever they are switched on.
 */
class CheckoutFields
{
    /** Request keys that satisfy each address field when the field itself is missing. */
    public const FALLBACKS = [
        'address_line' => ['shipping_address'],
        'recipient_name' => ['shipping_address.name'],
        'shipping_state_code' => ['shipping_address.state_code', 'shipping_address.state'],
        'shipping_city' => ['shipping_address.city'],
        'shipping_postcode' => ['shipping_address.postcode'],
        'location' => ['shipping_lat'],
    ];

    public static function configured(int $tenantId): bool
    {
        $stored = app(\App\Services\Modules\ModuleSettingsService::class)
            ->get($tenantId, CheckoutFlowSettings::MODULE, CheckoutFlowSettings::KEY, []);

        return is_array($stored) && $stored !== [];
    }

    /**
     * Validate one step's fields. Returns field => message (empty when valid).
     *
     * @param  array<string, mixed>  $cfg
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>|null  $rate  picked shipping rate (for delivery-time scope)
     * @return array<string, string>
     */
    public static function errors(array $cfg, string $step, array $data, ?array $rate = null, bool $strictAddress = true): array
    {
        $errors = [];
        if ($step === 'address' && $strictAddress) {
            foreach ($cfg['fields']['address'] as $f) {
                if (! $f['enabled'] || ! $f['required']) {
                    continue;
                }
                if (! self::filled($data, $f['key'])) {
                    $errors[$f['key']] = 'لطفا «'.$f['label'].'» را وارد کنید.';
                }
            }
            if (self::filled($data, 'customer_phone') && ! preg_match('/^0?9\d{9}$/', self::digits((string) $data['customer_phone']))
                && ! preg_match('/^(\+?98|0098)9\d{9}$/', self::digits((string) $data['customer_phone']))) {
                $errors['customer_phone'] = 'شماره موبایل معتبر نیست.';
            }
        }
        if ($step === 'delivery_time' && CheckoutFlowSettings::deliveryTimeApplies($cfg, $rate)) {
            $date = (string) ($data['delivery_date'] ?? '');
            $slot = (string) ($data['delivery_slot'] ?? '');
            $dateField = CheckoutFlowSettings::field($cfg, 'delivery_time', 'delivery_date');
            $slotField = CheckoutFlowSettings::field($cfg, 'delivery_time', 'delivery_slot');
            $days = collect(CheckoutFlowSettings::availableDays($cfg))->keyBy('date');
            if ($date === '') {
                if ($dateField && $dateField['enabled'] && $dateField['required']) {
                    $errors['delivery_date'] = 'روز ارسال را انتخاب کنید.';
                }
            } elseif (! $days->has($date)) {
                $errors['delivery_date'] = 'این روز برای ارسال در دسترس نیست.';
            }
            if ($slot === '') {
                if ($slotField && $slotField['enabled'] && $slotField['required']) {
                    $errors['delivery_slot'] = 'بازه زمانی ارسال را انتخاب کنید.';
                }
            } elseif ($date !== '' && $days->has($date) && ! collect($days[$date]['slots'])->contains('id', $slot)) {
                $errors['delivery_slot'] = 'این بازه زمانی در روز انتخاب‌شده در دسترس نیست.';
            }
        }
        if ($step === 'payment') {
            $terms = CheckoutFlowSettings::field($cfg, 'payment', 'terms');
            if ($terms && $terms['enabled'] && $terms['required'] && empty($data['terms_accepted'])) {
                $errors['terms_accepted'] = 'برای ثبت سفارش باید قوانین را بپذیرید.';
            }
            if (! empty($data['coupon_code']) && ! CheckoutFlowSettings::fieldEnabled($cfg, 'payment', 'coupon_code')) {
                $errors['coupon_code'] = 'استفاده از کد تخفیف در این فروشگاه غیرفعال است.';
            }
            if (! empty($data['gift_card_code']) && ! CheckoutFlowSettings::fieldEnabled($cfg, 'payment', 'gift_card_code')) {
                $errors['gift_card_code'] = 'استفاده از کارت هدیه در این فروشگاه غیرفعال است.';
            }
        }

        return $errors;
    }

    /**
     * Whether an address field must be present on the final checkout request.
     * When the merchant has not saved checkout-flow settings, guest checkout keeps
     * requiring recipient_name and customer_phone; signed-in checkout does not.
     */
    public static function addressFieldRequired(int $tenantId, string $key, bool $legacyGuest = false): bool
    {
        if (! self::configured($tenantId)) {
            return $legacyGuest && in_array($key, ['recipient_name', 'customer_phone'], true);
        }
        $cfg = app(CheckoutFlowSettings::class)->get($tenantId);
        $f = CheckoutFlowSettings::field($cfg, 'address', $key);

        return $f !== null && $f['enabled'] && $f['required'];
    }

    /**
     * Final order check (all steps). Adds the chosen delivery window to order meta.
     *
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>|null  $rate
     * @param  array<string, mixed>  $meta
     */
    public static function enforce(int $tenantId, array $data, ?array $rate, array &$meta): void
    {
        $cfg = app(CheckoutFlowSettings::class)->get($tenantId);
        $strict = self::configured($tenantId);
        $virtual = ! empty($data['_virtual']);
        $errors = [];
        foreach (CheckoutFlowSettings::STEPS as $step) {
            // Virtual-only carts (membership plans) skip the postal address, shipping and delivery time.
            if ($virtual && $step !== 'payment') {
                continue;
            }
            if ($step !== 'payment' && ! CheckoutFlowSettings::stepEnabled($cfg, $step)) {
                continue;
            }
            $errors += self::errors($cfg, $step, $data, $rate, $strict);
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
        if (CheckoutFlowSettings::deliveryTimeApplies($cfg, $rate) && ! empty($data['delivery_date'])) {
            $slot = collect($cfg['delivery_time']['slots'])->firstWhere('id', (string) ($data['delivery_slot'] ?? ''));
            $meta['delivery_time'] = array_filter([
                'date' => (string) $data['delivery_date'],
                'slot' => $slot['id'] ?? null,
                'label' => $slot['label'] ?? null,
                'from' => $slot['from'] ?? null,
                'to' => $slot['to'] ?? null,
            ], fn ($v) => $v !== null && $v !== '');
        }
        if (! empty($data['terms_accepted'])) {
            $meta['terms_accepted_at'] = now()->toIso8601String();
        }
    }

    /** @param array<string, mixed> $data */
    public static function filled(array $data, string $key): bool
    {
        if (self::present(data_get($data, $key))) {
            return true;
        }
        foreach (self::FALLBACKS[$key] ?? [] as $alt) {
            $v = data_get($data, $alt);
            if ($alt === 'shipping_address' && is_array($v)) {
                $v = $v['address'] ?? $v['address_line'] ?? null;
            }
            if (self::present($v)) {
                return true;
            }
        }

        return false;
    }

    protected static function present(mixed $v): bool
    {
        if (is_string($v)) {
            return trim($v) !== '';
        }

        if (is_array($v)) {
            return $v !== [];
        }

        return $v !== null;
    }

    protected static function digits(string $v): string
    {
        return preg_replace('/\D+/', '', strtr($v, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9'])) ?? '';
    }
}
