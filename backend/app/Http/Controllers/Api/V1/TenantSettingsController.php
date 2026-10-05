<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AiContent\AiContentSettings;
use App\Services\Auth\OtpSettings;
use App\Services\Analytics\AnalyticsSettings;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Notifications\NotificationSettings;
use App\Services\Notifications\TenantMailer;
use App\Services\Marketplace\MarketplacePlatforms;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Orders\OrderDocumentSettings;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Pwa\PwaSettings;
use App\Services\Security\SecuritySettings;
use App\Services\Shop\ShopSettings;
use App\Services\Shop\StorefrontAppearanceService;
use Illuminate\Http\Request;

class TenantSettingsController extends Controller
{
    private const AREAS = ['site', 'shop'];

    private const SECTIONS = [
        'site' => ['security', 'ai', 'analytics', 'sms', 'pwa', 'dashboard', 'notifications', 'general', 'privacy', 'style', 'system-logs', 'license'],
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
        $this->assertSensitiveRead($request, $key);
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
            $prefs = $settings->get($tenantId, 'settings', 'site.dashboard.prefs', [
                'ui_locale' => 'fa',
                'ui_theme' => 'system',
                'ui_fullscreen_default' => false,
            ]);

            return response()->json(['data' => array_merge($this->dashboardHostSettings(), $prefs)]);
        }
        if ($key === SecuritySettings::KEY) {
            return response()->json(['data' => SecuritySettings::get($tenantId)]);
        }
        if ($key === OtpSettings::KEY) {
            return response()->json(['data' => OtpSettings::forTenant($tenantId, $settings)]);
        }
        if ($key === 'shop.payments') {
            $hub = app(PaymentGatewaySettingsService::class)->getHub($tenantId);

            return response()->json([
                'data' => [
                    'enabled' => $hub['enabled'] ?? [],
                    'geo_notice' => $hub['geo_notice'] ?? app(PaymentGatewaySettingsService::class)->defaultGeoNotice(),
                    '_source' => 'payments.hub',
                ],
            ]);
        }
        if ($key === 'shop.marketplace') {
            $svc = app(MarketplaceSettingsService::class);
            $platforms = [];
            foreach (MarketplacePlatforms::slugs() as $slug) {
                $platforms[$slug] = [
                    'enabled' => $svc->isEnabled($tenantId, $slug),
                    'auto_sync' => $svc->isAutoSync($tenantId, $slug),
                    'kind' => MarketplacePlatforms::CATALOG[$slug]['kind'] ?? null,
                ];
            }

            return response()->json(['data' => ['platforms' => $platforms, '_source' => 'marketplace.settings']]);
        }
        if ($key === 'site.general') {
            return response()->json(['data' => $this->siteGeneral($tenantId, $settings)]);
        }
        if ($key === 'site.privacy') {
            return response()->json(['data' => $settings->get($tenantId, 'settings', 'site.privacy', $this->defaultsFor('site.privacy'))]);
        }
        if ($key === 'site.style') {
            return response()->json(['data' => $this->siteStyle($tenantId)]);
        }
        if ($key === 'site.system-logs') {
            return response()->json(['data' => $this->systemLogsMeta()]);
        }
        if ($key === 'site.license') {
            return response()->json(['data' => $this->licenseMeta($tenantId)]);
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
            return response()->json(['data' => $this->saveDashboardPrefs($tenantId, $settings, $payload['payload'])]);
        }
        if ($key === SecuritySettings::KEY) {
            return response()->json(['data' => SecuritySettings::save($tenantId, $payload['payload'])]);
        }
        if ($key === OtpSettings::KEY) {
            $current = OtpSettings::forTenant($tenantId, $settings);
            $merged = array_replace_recursive(OtpSettings::defaults(), $current, $payload['payload']);
            $settings->put($tenantId, 'settings', OtpSettings::KEY, $merged);

            return response()->json(['data' => OtpSettings::forTenant($tenantId, $settings)]);
        }
        if ($key === 'shop.payments') {
            $hub = app(PaymentGatewaySettingsService::class)->saveHub($tenantId, $payload['payload']);

            return response()->json([
                'data' => [
                    'enabled' => $hub['enabled'] ?? [],
                    'geo_notice' => $hub['geo_notice'] ?? app(PaymentGatewaySettingsService::class)->defaultGeoNotice(),
                    '_source' => 'payments.hub',
                ],
            ]);
        }
        if ($key === 'shop.marketplace') {
            $svc = app(MarketplaceSettingsService::class);
            $platforms = [];
            foreach (MarketplacePlatforms::slugs() as $slug) {
                $platforms[$slug] = [
                    'enabled' => $svc->isEnabled($tenantId, $slug),
                    'auto_sync' => $svc->isAutoSync($tenantId, $slug),
                ];
            }

            return response()->json([
                'data' => [
                    'platforms' => $platforms,
                    '_source' => 'marketplace.settings',
                    '_read_only' => true,
                ],
            ]);
        }
        if ($key === 'site.general') {
            return response()->json(['data' => $this->saveSiteGeneral($tenantId, $settings, $payload['payload'])]);
        }
        if ($key === 'site.privacy') {
            $defaults = $this->defaultsFor('site.privacy');
            $merged = array_replace_recursive($defaults, $payload['payload']);
            $merged['guest_checkout'] = ! empty($merged['guest_checkout']);
            $merged['account_creation'] = ! empty($merged['account_creation']);
            $saved = $settings->put($tenantId, 'settings', 'site.privacy', $merged);
            // Keep shop.general.guest_checkout aligned for checkout consumers.
            $general = ShopSettings::getGeneral($tenantId);
            $general['guest_checkout'] = $merged['guest_checkout'];
            ShopSettings::saveGeneral($tenantId, $general);

            return response()->json(['data' => $saved]);
        }
        if ($key === 'site.style') {
            return response()->json(['data' => $this->saveSiteStyle($tenantId, $payload['payload'])]);
        }
        if ($key === 'site.system-logs' || $key === 'site.license') {
            return response()->json(['message' => 'Read-only section'], 422);
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
            'site.security' => SecuritySettings::defaults(),
            'site.ai' => AiContentSettings::defaults(),
            'site.analytics' => AnalyticsSettings::defaults(),
            'site.pwa' => PwaSettings::defaults(),
            'site.dashboard' => [
                'self_update_enabled' => (bool) config('dashboard.self_update'),
                'build_pipeline_enabled' => (bool) config('dashboard.build_pipeline'),
                'version' => (string) config('dashboard.version', '0.0.0'),
                'ui_locale' => 'fa',
                'ui_theme' => 'system',
                'ui_fullscreen_default' => false,
            ],
            'site.general' => [
                'site_title' => '',
                'tagline' => '',
                'admin_email' => '',
                'timezone' => 'Asia/Tehran',
            ],
            'site.privacy' => [
                'guest_checkout' => false,
                'account_creation' => true,
                'privacy_policy_page_id' => null,
                'terms_page_id' => null,
            ],
            'site.style' => [],
            'site.system-logs' => [],
            'site.license' => [],
            'site.sms' => OtpSettings::defaults(),
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
                'platforms' => [],
                '_source' => 'marketplace.settings',
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
                'enabled' => [],
                'geo_notice' => [],
                '_source' => 'payments.hub',
            ],
            'shop.advanced' => ShopSettings::advancedDefaults(),
            default => [],
        };
    }

    /** @return array<string, mixed> */
    private function dashboardHostSettings(): array
    {
        $host = [
            'self_update_enabled' => (bool) config('dashboard.self_update'),
            'build_pipeline_enabled' => (bool) config('dashboard.build_pipeline'),
            'version' => (string) config('dashboard.version', '0.0.0'),
        ];
        // Prefs are merged in show via saveDashboardPrefs path; keep host caps here.
        return $host;
    }

    /** @return array<string, mixed> */
    private function siteGeneral(int $tenantId, ModuleSettingsService $settings): array
    {
        $tenant = \App\Models\Tenant::query()->find($tenantId);
        $stored = $settings->get($tenantId, 'settings', 'site.general', $this->defaultsFor('site.general'));

        return [
            'site_title' => (string) ($stored['site_title'] ?: ($tenant?->store_display_name ?: $tenant?->name ?: '')),
            'tagline' => (string) ($stored['tagline'] ?? ''),
            'admin_email' => (string) ($stored['admin_email'] ?? ''),
            'timezone' => (string) ($stored['timezone'] ?? 'Asia/Tehran'),
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function saveSiteGeneral(int $tenantId, ModuleSettingsService $settings, array $input): array
    {
        $clean = [
            'site_title' => mb_substr(trim((string) ($input['site_title'] ?? '')), 0, 255),
            'tagline' => mb_substr(trim((string) ($input['tagline'] ?? '')), 0, 255),
            'admin_email' => mb_substr(trim((string) ($input['admin_email'] ?? '')), 0, 255),
            'timezone' => mb_substr(trim((string) ($input['timezone'] ?? 'Asia/Tehran')), 0, 64) ?: 'Asia/Tehran',
        ];
        $settings->put($tenantId, 'settings', 'site.general', $clean);
        $tenant = \App\Models\Tenant::query()->find($tenantId);
        if ($tenant && $clean['site_title'] !== '') {
            $tenant->store_display_name = $clean['site_title'];
            $tenant->save();
        }

        return $clean;
    }

    /** @return array<string, mixed> */
    private function siteStyle(int $tenantId): array
    {
        $tenant = \App\Models\Tenant::query()->findOrFail($tenantId);
        $branding = \App\Kernel\ThemeCatalog::normalizeBranding($tenant->branding);

        return $branding;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function saveSiteStyle(int $tenantId, array $input): array
    {
        $tenant = \App\Models\Tenant::query()->findOrFail($tenantId);
        $current = \App\Kernel\ThemeCatalog::normalizeBranding($tenant->branding);
        $merged = array_merge($current, $input);
        $tenant->branding = \App\Kernel\ThemeCatalog::mergeIntoExisting(
            $tenant->branding,
            \App\Kernel\ThemeCatalog::normalizeBranding($merged)
        );
        $tenant->save();

        $branding = \App\Kernel\ThemeCatalog::normalizeBranding($tenant->branding);
        $palette = is_array($branding['palette'] ?? null) ? $branding['palette'] : [];
        $colorSync = array_filter([
            'primary_color' => $palette['primary'] ?? null,
            'secondary_color' => $palette['secondary'] ?? null,
            'accent_color' => $palette['accent'] ?? null,
            'text1_color' => $palette['text'] ?? null,
            'text2_color' => $palette['muted'] ?? null,
            'text3_color' => $palette['text3'] ?? null,
            'navy_color' => $palette['navy'] ?? null,
            'surface_color' => $palette['surface'] ?? null,
            'header_bg' => $palette['header'] ?? null,
            'footer_bg' => $palette['footer'] ?? null,
            'border_color' => $palette['border'] ?? null,
        ], static fn ($v) => is_string($v) && $v !== '');
        if ($colorSync !== []) {
            app(StorefrontAppearanceService::class)->save($tenantId, $colorSync);
        }

        return $branding;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function saveDashboardPrefs(int $tenantId, ModuleSettingsService $settings, array $input): array
    {
        $host = $this->dashboardHostSettings();
        $prefs = [
            'ui_locale' => in_array(($input['ui_locale'] ?? ''), ['fa', 'en'], true) ? $input['ui_locale'] : 'fa',
            'ui_theme' => in_array(($input['ui_theme'] ?? ''), ['system', 'light', 'dark'], true) ? $input['ui_theme'] : 'system',
            'ui_fullscreen_default' => ! empty($input['ui_fullscreen_default']),
        ];
        $settings->put($tenantId, 'settings', 'site.dashboard.prefs', $prefs);

        return array_merge($host, $prefs);
    }

    /** @return array<string, mixed> */
    private function systemLogsMeta(): array
    {
        $logPath = storage_path('logs/laravel.log');
        $size = is_file($logPath) ? filesize($logPath) : 0;
        $mtime = is_file($logPath) ? filemtime($logPath) : null;
        $tail = [];
        if (is_file($logPath) && is_readable($logPath)) {
            $lines = @file($logPath, FILE_IGNORE_NEW_LINES);
            if (is_array($lines)) {
                $tail = array_slice($lines, -80);
            }
        }

        return [
            'log_file' => 'laravel.log',
            'size_bytes' => $size,
            'modified_at' => $mtime ? date('c', $mtime) : null,
            'tail' => $tail,
        ];
    }

    private function assertSensitiveRead(\Illuminate\Http\Request $request, string $key): void
    {
        $caps = app(\App\Support\CapabilityChecker::class);
        $user = $request->user();
        $security = in_array($key, [SecuritySettings::KEY, OtpSettings::KEY, 'site.system-logs'], true);
        // Match bots.* and nested keys like shop.bots.* / *.bots.*
        $bots = str_starts_with($key, 'bots.')
            || str_contains($key, '.bots.')
            || str_ends_with($key, '.bots');
        if ($security && ! $caps->allows($user, 'settings.manage')) {
            abort(403, __('api.forbidden'));
        }
        if ($bots && ! $caps->allows($user, 'marketing.*') && ! $caps->allows($user, 'settings.manage')) {
            abort(403, __('api.forbidden'));
        }
    }

    /** @return array<string, mixed> */
    private function licenseMeta(int $tenantId): array
    {
        $tenant = \App\Models\Tenant::query()->find($tenantId);

        return [
            'status' => (string) ($tenant?->license_status ?? 'unknown'),
            'checked_at' => optional($tenant?->license_checked_at)?->toIso8601String(),
            'unreachable' => (bool) ($tenant?->license_unreachable ?? false),
            'last_error' => $tenant?->license_last_error,
            'has_domain' => filled($tenant?->domain),
            'has_key' => filled($tenant?->domain),
        ];
    }

}

