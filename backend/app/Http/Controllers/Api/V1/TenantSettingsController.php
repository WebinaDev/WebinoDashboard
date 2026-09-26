<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;

class TenantSettingsController extends Controller
{
    private const AREAS = ['site', 'shop'];

    private const SECTIONS = [
        'site' => ['security', 'ai', 'analytics', 'sms'],
        'shop' => [
            'general',
            'accounting',
            'bots',
            'marketplace',
            'pricing',
            'shipping',
            'payments',
            'invoices',
            'advanced',
            'accounting.tax',
            'accounting.modian',
            'shipping.zones',
            'shipping.tapin',
            'bots.bale',
            'bots.telegram',
        ],
    ];

    public function show(Request $request, ModuleSettingsService $settings, string $area, string $section, ?string $sub = null): \Illuminate\Http\JsonResponse
    {
        $key = $this->resolveKey($area, $section, $sub);
        if ($key === null) {
            return response()->json(['message' => 'Unknown settings section'], 404);
        }

        $tenantId = (int) $request->user()->tenant_id;
        $defaults = $this->defaultsFor($key);

        return response()->json([
            'data' => $settings->get($tenantId, 'settings', $key, $defaults),
        ]);
    }

    public function update(Request $request, ModuleSettingsService $settings, string $area, string $section, ?string $sub = null): \Illuminate\Http\JsonResponse
    {
        $key = $this->resolveKey($area, $section, $sub);
        if ($key === null) {
            return response()->json(['message' => 'Unknown settings section'], 404);
        }

        $payload = $request->validate([
            'payload' => ['required', 'array'],
        ]);

        $tenantId = (int) $request->user()->tenant_id;
        $defaults = $this->defaultsFor($key);
        $merged = array_replace_recursive($defaults, $payload['payload']);
        $saved = $settings->put($tenantId, 'settings', $key, $merged);

        return response()->json(['data' => $saved]);
    }

    private function resolveKey(string $area, string $section, ?string $sub = null): ?string
    {
        $area = strtolower($area);
        $section = strtolower(trim($section, '/'));
        $full = $sub ? "{$section}.".strtolower(trim($sub, '/')) : $section;
        if (! in_array($area, self::AREAS, true)) {
            return null;
        }
        $allowed = self::SECTIONS[$area] ?? [];
        if (! in_array($full, $allowed, true)) {
            return null;
        }

        return "{$area}.{$full}";
    }

    /** @return array<string, mixed> */
    private function defaultsFor(string $key): array
    {
        return match ($key) {
            'site.security' => [
                'general' => [
                    'profile' => 'recommended',
                    'enabled' => true,
                    'wizard_completed' => false,
                ],
                'privacy' => [
                    'hide_wp_version' => true,
                    'disable_file_edit' => true,
                ],
                'login' => [
                    'limit_attempts' => true,
                    'max_attempts' => 5,
                    'lockout_minutes' => 15,
                    'force_2fa_admins' => false,
                ],
                'waf' => [
                    'enabled' => true,
                    'enforce' => false,
                ],
                'headers' => [
                    'x_frame_options' => 'SAMEORIGIN',
                    'referrer_policy' => 'strict-origin-when-cross-origin',
                ],
                'notify' => [
                    'email' => true,
                    'site' => true,
                ],
            ],
            'site.ai' => [
                'enabled' => false,
                'provider' => 'gapgpt',
                'api_key' => '',
                'model' => '',
                'do_product' => true,
                'prompt_product' => '',
                'temperature' => 0.7,
            ],
            'site.analytics' => [
                'enabled' => false,
                'provider' => 'none',
                'ga_measurement_id' => '',
                'gtm_id' => '',
                'clarity_id' => '',
                'track_admin' => false,
            ],
            'site.sms' => [
                'enabled' => false,
                'otp_login_enabled' => false,
                'otp_register_enabled' => false,
                'otp_expiry_minutes' => 5,
                'otp_length' => 5,
            ],
            'shop.general' => [
                'store_display_name' => '',
                'sold_individually_default' => false,
                'enable_coupons' => true,
                'calc_taxes' => true,
            ],
            'shop.accounting', 'shop.accounting.tax' => [
                'prices_include_tax' => false,
                'tax_rate_percent' => 9,
                'display_prices' => 'excl',
            ],
            'shop.accounting.modian' => [
                'enabled' => false,
                'economic_code' => '',
                'national_id' => '',
                'api_key' => '',
                'sandbox' => true,
            ],
            'shop.marketplace' => [
                'basalam_enabled' => false,
                'digikala_enabled' => false,
                'auto_sync' => false,
            ],
            'shop.pricing' => [
                'enable_wholesale' => false,
                'enable_installment' => false,
                'round_to' => 1000,
            ],
            'shop.shipping', 'shop.shipping.zones' => [
                'enable_shipping' => true,
                'default_method' => 'flat_rate',
                'free_shipping_min' => 0,
                '_hint' => 'Use /api/v1/shipping/zones for full CRUD',
            ],
            'shop.shipping.tapin' => [
                'enabled' => false,
                'gateway' => 'tapin',
                'shop_id' => '',
                'has_token' => false,
                '_hint' => 'Use /api/v1/shipping/tapin for full settings',
            ],
            'shop.payments' => [
                'cod_enabled' => true,
                'zarinpal_enabled' => false,
                'zarinpal_merchant' => '',
                'wallet_enabled' => false,
            ],
            'shop.invoices' => [
                'company_name' => '',
                'address' => '',
                'phone' => '',
                'show_logo' => true,
                'footer_note' => '',
            ],
            'shop.advanced' => [
                'delete_data_on_uninstall' => false,
                'debug_mode' => false,
                'legacy_api' => false,
            ],
            default => [],
        };
    }
}
