<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AiContent\AiContentSettings;
use App\Services\Analytics\AnalyticsSettings;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Notifications\NotificationSettings;
use App\Services\Notifications\TenantMailer;
use App\Services\Orders\OrderDocumentSettings;
use App\Services\Pwa\PwaSettings;
use App\Services\Shop\ShopSettings;
use Illuminate\Http\Request;

class TenantSettingsController extends Controller
{
    private const AREAS = ['site', 'shop'];

    private const SECTIONS = [
        'site' => ['security', 'ai', 'analytics', 'sms', 'pwa', 'dashboard', 'notifications'],
        'shop' => [
            'general',
            'products',
            'downloads',
            'reviews',
            'maps',
            'loyalty',
            'archive',
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
        if ($key === OrderDocumentSettings::KEY) {
            return response()->json(['data' => OrderDocumentSettings::get($tenantId, $this->locale($request))]);
        }
        if ($key === AnalyticsSettings::KEY) {
            return response()->json(['data' => AnalyticsSettings::public($tenantId)]);
        }
        if ($key === AiContentSettings::KEY) {
            return response()->json(['data' => AiContentSettings::public($tenantId)]);
        }
        if ($key === NotificationSettings::KEY) {
            return response()->json(['data' => NotificationSettings::public($tenantId)]);
        }
        if ($key === ShopSettings::GENERAL_KEY) {
            return response()->json(['data' => ShopSettings::getGeneral($tenantId)]);
        }
        if ($key === ShopSettings::PRODUCTS_KEY) {
            return response()->json(['data' => ShopSettings::getProducts($tenantId)]);
        }
        if ($key === ShopSettings::TAX_KEY || $key === 'shop.accounting') {
            return response()->json(['data' => ShopSettings::getTax($tenantId)]);
        }
        if ($key === ShopSettings::ADVANCED_KEY) {
            return response()->json(['data' => ShopSettings::getAdvanced($tenantId)]);
        }
        if ($key === ShopSettings::DOWNLOADS_KEY) {
            return response()->json(['data' => ShopSettings::getDownloads($tenantId)]);
        }
        if ($key === ShopSettings::REVIEWS_KEY) {
            return response()->json(['data' => ShopSettings::getReviews($tenantId)]);
        }
        if ($key === ShopSettings::MAPS_KEY) {
            return response()->json(['data' => ShopSettings::publicMaps(ShopSettings::getMaps($tenantId))]);
        }
        if ($key === ShopSettings::LOYALTY_KEY) {
            return response()->json(['data' => ShopSettings::getLoyalty($tenantId)]);
        }
        if ($key === ShopSettings::ARCHIVE_KEY) {
            return response()->json(['data' => ShopSettings::getArchive($tenantId)]);
        }
        if ($key === PwaSettings::KEY) {
            return response()->json(['data' => PwaSettings::forTenant($tenantId, $this->locale($request))]);
        }
        if ($key === 'site.dashboard') {
            return response()->json(['data' => $this->dashboardHostSettings()]);
        }
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
        if ($key === OrderDocumentSettings::KEY) {
            return response()->json(['data' => OrderDocumentSettings::save($tenantId, $payload['payload'], $this->locale($request))]);
        }
        if ($key === AnalyticsSettings::KEY) {
            return response()->json(['data' => AnalyticsSettings::save($tenantId, $payload['payload'])]);
        }
        if ($key === AiContentSettings::KEY) {
            return response()->json(['data' => AiContentSettings::save($tenantId, $payload['payload'])]);
        }
        if ($key === NotificationSettings::KEY) {
            return response()->json(['data' => NotificationSettings::save($tenantId, $payload['payload'])]);
        }
        if ($key === ShopSettings::GENERAL_KEY) {
            return response()->json(['data' => ShopSettings::saveGeneral($tenantId, $payload['payload'])]);
        }
        if ($key === ShopSettings::PRODUCTS_KEY) {
            return response()->json(['data' => ShopSettings::saveProducts($tenantId, $payload['payload'])]);
        }
        if ($key === ShopSettings::TAX_KEY || $key === 'shop.accounting') {
            return response()->json(['data' => ShopSettings::saveTax($tenantId, $payload['payload'])]);
        }
        if ($key === ShopSettings::ADVANCED_KEY) {
            return response()->json(['data' => ShopSettings::saveAdvanced($tenantId, $payload['payload'])]);
        }
        if ($key === ShopSettings::DOWNLOADS_KEY) {
            return response()->json(['data' => ShopSettings::saveDownloads($tenantId, $payload['payload'])]);
        }
        if ($key === ShopSettings::REVIEWS_KEY) {
            return response()->json(['data' => ShopSettings::saveReviews($tenantId, $payload['payload'])]);
        }
        if ($key === ShopSettings::MAPS_KEY) {
            return response()->json(['data' => ShopSettings::saveMaps($tenantId, $payload['payload'])]);
        }
        if ($key === ShopSettings::LOYALTY_KEY) {
            return response()->json(['data' => ShopSettings::saveLoyalty($tenantId, $payload['payload'])]);
        }
        if ($key === ShopSettings::ARCHIVE_KEY) {
            return response()->json(['data' => ShopSettings::saveArchive($tenantId, $payload['payload'])]);
        }
        if ($key === PwaSettings::KEY) {
            return response()->json([
                'data' => PwaSettings::save($tenantId, $payload['payload'], $this->locale($request)),
            ]);
        }
        if ($key === 'site.dashboard') {
            return response()->json(['data' => $this->dashboardHostSettings()]);
        }
        $defaults = $this->defaultsFor($key);
        $merged = array_replace_recursive($defaults, $payload['payload']);
        $saved = $settings->put($tenantId, 'settings', $key, $merged);

        return response()->json(['data' => $saved]);
    }

    public function testNotificationEmail(Request $request, TenantMailer $mailer): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'to' => ['required', 'email', 'max:255'],
        ]);
        $tenantId = (int) $request->user()->tenant_id;
        $ok = $mailer->send($tenantId, $data['to'], 'SMTP test', 'SMTP test message.');

        return response()->json(['data' => ['ok' => $ok]], $ok ? 200 : 422);
    }

    private function locale(Request $request): string
    {
        return OrderDocumentSettings::locale($request->query('locale') ?: $request->header('Accept-Language'));
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
            'site.ai' => AiContentSettings::defaults(),
            'site.analytics' => AnalyticsSettings::defaults(),
            'site.pwa' => PwaSettings::defaults(),
            'site.dashboard' => [
                'self_update_enabled' => (bool) config('dashboard.self_update'),
                'build_pipeline_enabled' => (bool) config('dashboard.build_pipeline'),
                'version' => (string) config('dashboard.version', '0.0.0'),
            ],
            'site.sms' => [
                'enabled' => false,
                'otp_login_enabled' => false,
                'otp_register_enabled' => false,
                'otp_expiry_minutes' => 5,
                'otp_length' => 5,
                'otp_max_attempts' => 5,
            ],
            'shop.general' => ShopSettings::generalDefaults(),
            'shop.products' => ShopSettings::productsDefaults(),
            'shop.downloads' => ShopSettings::downloadsDefaults(),
            'shop.reviews' => ShopSettings::reviewsDefaults(),
            'shop.maps' => ShopSettings::mapsDefaults(),
            'shop.loyalty' => ShopSettings::loyaltyDefaults(),
            'shop.archive' => ShopSettings::archiveDefaults(),
            'shop.accounting', 'shop.accounting.tax' => ShopSettings::taxDefaults(),
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
            'shop.advanced' => ShopSettings::advancedDefaults(),
            default => [],
        };
    }

    /** @return array<string, mixed> */
    private function dashboardHostSettings(): array
    {
        return [
            'self_update_enabled' => (bool) config('dashboard.self_update'),
            'build_pipeline_enabled' => (bool) config('dashboard.build_pipeline'),
            'version' => (string) config('dashboard.version', '0.0.0'),
        ];
    }
}
