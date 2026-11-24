<?php

namespace Modules\Cafe\Services;

use App\Models\Product;
use App\Models\ProductModifierOption;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Sms\SmsPanelAdapterRegistry;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Guest ordering identity for the digital menu.
 *
 * A guest scans a table QR and orders with a browser-scoped token. When the cafe asks for
 * phone verification we send a short OTP and remember the verified phone against that
 * token, so the customer can later open "my orders" without a password. Nothing here
 * issues a login token: it proves the guest controls a phone number for delivery contact
 * and order history, exactly like a waiter writing the number down.
 */
final class CafeGuestAuth
{
    public const MAX_ATTEMPTS = 5;

    public function __construct(
        private readonly ModuleSettingsService $settings,
        private readonly SmsPanelAdapterRegistry $sms,
    ) {}

    /** @return array<string, mixed> */
    public function menu(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults());

        return array_merge(ModuleSettingsService::cafeMenuDefaults(), is_array($stored) ? $stored : []);
    }

    /** Phone numbers are compared in one normalised shape so «۰۹۱۲…» and «+98912…» match. */
    public static function normalizePhone(string $phone): string
    {
        $phone = strtr(trim($phone), [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (str_starts_with($digits, '0098')) {
            $digits = '0'.substr($digits, 4);
        } elseif (str_starts_with($digits, '98') && strlen($digits) === 12) {
            $digits = '0'.substr($digits, 2);
        } elseif (str_starts_with($digits, '9') && strlen($digits) === 10) {
            $digits = '0'.$digits;
        }

        return $digits;
    }

    public static function phoneIsValid(string $phone): bool
    {
        return (bool) preg_match('/^09\d{9}$/', self::normalizePhone($phone));
    }

    /** True when this phone is already proven for this guest token. */
    public function verifiedPhone(int $tenantId, ?string $guestToken): ?string
    {
        if (! is_string($guestToken) || $guestToken === '') {
            return null;
        }

        $row = \Modules\Cafe\Entities\CafeGuestVerification::query()
            ->where('tenant_id', $tenantId)
            ->where('guest_token', $guestToken)
            ->whereNotNull('verified_at')
            ->first();

        return $row?->phone;
    }

    /** @return array{verified: bool, phone: string|null, masked: string|null} */
    public function state(int $tenantId, ?string $guestToken): array
    {
        $phone = $this->verifiedPhone($tenantId, $guestToken);

        return [
            'verified' => $phone !== null,
            'phone' => $phone,
            'masked' => $phone !== null ? self::mask($phone) : null,
        ];
    }

    /**
     * Send a login/verify code. Rate-limited per token so a refresh loop cannot burn the SMS
     * credit, and never returns the code itself.
     *
     * @return array{ok: bool, code: string|null, message: string}
     */
    public function sendCode(Tenant $tenant, string $guestToken, string $phone): array
    {
        $phone = self::normalizePhone($phone);
        if (! self::phoneIsValid($phone)) {
            return ['ok' => false, 'code' => 'invalid_phone', 'message' => __('api.cafe_phone_invalid')];
        }

        $lockKey = "cafe_otp:lock:{$tenant->id}:{$guestToken}";
        if (Cache::has($lockKey)) {
            return ['ok' => false, 'code' => 'toosoon', 'message' => __('api.cafe_otp_toosoon')];
        }

        $code = (string) random_int(10000, 99999);
        \Modules\Cafe\Entities\CafeGuestOtp::query()
            ->where('tenant_id', $tenant->id)
            ->where('guest_token', $guestToken)
            ->delete();
        \Modules\Cafe\Entities\CafeGuestOtp::query()->create([
            'tenant_id' => $tenant->id,
            'guest_token' => $guestToken,
            'phone' => $phone,
            'code' => $code,
            'attempts' => 0,
            'expires_at' => now()->addMinutes(3),
        ]);

        $delivered = $this->deliver($tenant, $phone, $code);
        if (! $delivered) {
            \Modules\Cafe\Entities\CafeGuestOtp::query()
                ->where('tenant_id', $tenant->id)
                ->where('guest_token', $guestToken)
                ->delete();

            return ['ok' => false, 'code' => 'undeliverable', 'message' => __('api.cafe_otp_undeliverable')];
        }

        Cache::put($lockKey, true, 60);

        return ['ok' => true, 'code' => null, 'message' => __('api.cafe_otp_sent')];
    }

    /**
     * Verify a code and remember the phone for this guest token.
     *
     * @return array{ok: bool, code: string|null, message: string}
     */
    public function verifyCode(Tenant $tenant, string $guestToken, string $phone, string $input): array
    {
        $phone = self::normalizePhone($phone);
        $input = trim(strtr($input, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]));

        if (! preg_match('/^\d{4,8}$/', $input)) {
            return ['ok' => false, 'code' => 'invalid_code', 'message' => __('api.cafe_otp_invalid')];
        }

        $row = \Modules\Cafe\Entities\CafeGuestOtp::query()
            ->where('tenant_id', $tenant->id)
            ->where('guest_token', $guestToken)
            ->where('phone', $phone)
            ->latest('id')
            ->first();

        if (! $row || $row->expires_at->isPast()) {
            return ['ok' => false, 'code' => 'expired', 'message' => __('api.cafe_otp_expired')];
        }

        if ((int) $row->attempts >= self::MAX_ATTEMPTS) {
            $row->delete();

            return ['ok' => false, 'code' => 'attempts', 'message' => __('api.cafe_otp_attempts')];
        }

        if (! hash_equals((string) $row->code, $input)) {
            $row->increment('attempts');

            return ['ok' => false, 'code' => 'invalid_code', 'message' => __('api.cafe_otp_invalid')];
        }

        $row->delete();
        \Modules\Cafe\Entities\CafeGuestVerification::query()->updateOrCreate(
            ['tenant_id' => $tenant->id, 'guest_token' => $guestToken],
            ['phone' => $phone, 'verified_at' => now()],
        );

        // Guest order history is looked up by guest token; keep the phone on the cart too so
        // a later checkout can prefill it.
        \App\Models\Cart::query()
            ->where('tenant_id', $tenant->id)
            ->where('guest_token', $guestToken)
            ->update(['guest_phone' => $phone]);

        return ['ok' => true, 'code' => null, 'message' => __('api.cafe_otp_verified')];
    }

    /**
     * Optional "name this item" extras: every add-on row staff marked on the item's
     * modifiers is offered unselected. These add text to the kitchen ticket, not money;
     * paid extras keep their price and selection rules.
     *
     * @return list<array{modifier_id: int, name_fa: string, name_en: string}>
     */
    public static function addonsFor(Product $product): array
    {
        if (! $product->relationLoaded('modifiers')) {
            return [];
        }

        $rows = [];
        foreach ($product->modifiers as $modifier) {
            if (! $modifier->relationLoaded('options')) {
                continue;
            }
            foreach ($modifier->options as $option) {
                if (! $option->is_addon) {
                    continue;
                }
                $rows[] = [
                    'modifier_id' => (int) $modifier->id,
                    'name_fa' => (string) $option->name_fa,
                    'name_en' => (string) $option->name_en,
                ];
            }
        }

        return $rows;
    }

    /** @return list<int> add-on option ids an item exposes */
    public static function addonOptionIds(Product $product): array
    {
        if (! $product->relationLoaded('modifiers')) {
            return [];
        }

        $ids = [];
        foreach ($product->modifiers as $modifier) {
            foreach ($modifier->options as $option) {
                if ($option->is_addon) {
                    $ids[] = (int) $option->id;
                }
            }
        }

        return $ids;
    }

    /** Options an add-on must not charge for; a priced add-on stays a paid modifier. */
    public static function isAddonOption(ProductModifierOption $option): bool
    {
        return (bool) $option->is_addon;
    }

    public static function mask(string $phone): string
    {
        $len = strlen($phone);
        if ($len <= 4) {
            return str_repeat('*', $len);
        }

        return str_repeat('*', max(0, $len - 4)).substr($phone, -4);
    }

    private function deliver(Tenant $tenant, string $phone, string $code): bool
    {
        $siteName = (string) ($tenant->store_display_name ?: $tenant->name);
        $template = (string) ($this->menu($tenant->id)['guest_otp_template'] ?? '');
        if (trim($template) === '') {
            $template = __('api.cafe_otp_template', ['site' => $siteName]);
        }
        $message = str_replace(['{code}', '{site}'], [$code, $siteName], $template);

        try {
            // Secondary panels (Kavenegar) first, then the ERP ModirPayamak proxy the rest of
            // the dashboard uses. Both are optional: a cafe may run without any SMS credit.
            $result = $this->sms->send($tenant, ['message' => $message, 'recipients' => [$phone]]);
            if (! empty($result['ok'])) {
                return true;
            }

            $proxied = app(\App\Services\Sms\ModirPayamakClient::class)->post($tenant, 'send', [
                'message' => $message,
                'recipients' => [$phone],
            ]);
            if (! empty($proxied['ok']) && empty($proxied['data']['unavailable'])) {
                return true;
            }
        } catch (\Throwable $e) {
            Log::warning('cafe.guest_otp.sms_failed', ['tenant' => $tenant->id, 'error' => $e->getMessage()]);
        }

        // Without an SMS panel an operator can still walk the guest through the code:
        // it is written to the log (never returned by the API) and the dashboard shows it.
        Log::info('cafe.guest_otp', ['tenant' => $tenant->id, 'phone' => self::mask($phone), 'code' => $code]);

        return app()->environment(['local', 'testing']) || (bool) ($this->menu($tenant->id)['guest_otp_log_fallback'] ?? false);
    }

    /** Fresh token for tests and for browsers that never had a cart. */
    public static function newToken(): string
    {
        return Str::random(32);
    }
}
