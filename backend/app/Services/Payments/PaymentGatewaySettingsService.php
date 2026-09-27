<?php

namespace App\Services\Payments;

use App\Services\Marketplace\Basalam\BasalamPay;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Wallet\WalletService;
use App\Http\Controllers\Api\V1\C2cController;
use App\Models\BotSetting;
use App\Models\C2cSetting;
use App\Models\WalletSetting;

/**
 * Tenant payment gateway settings (hub + per-provider credentials).
 */
class PaymentGatewaySettingsService
{
    public const MODULE = 'payments';

    /** @var list<string> */
    public const GATEWAY_IDS = [
        'zarinpal',
        'digipay',
        'snapppay',
        'torobpay',
        'bale_pay',
        'basalam_pay',
        'wallet',
        'c2c',
        'cod',
    ];

    /** @var list<string> */
    public const SECRET_KEYS = [
        'access_token',
        'client_secret',
        'password',
        'client_password',
    ];

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array{enabled: bool, services: array<string, bool>} */
    public function defaultGeoNotice(): array
    {
        return [
            'enabled' => true,
            'services' => [
                'cloudflare' => true,
                'woocommerce' => true,
                'analytics' => true,
                'ip_api' => true,
                'ipwho' => true,
                'geojs' => true,
                'country_is' => true,
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function defaultHub(): array
    {
        $enabled = [];
        foreach (self::GATEWAY_IDS as $id) {
            $enabled[$id] = false;
        }
        $enabled['cod'] = true;

        return [
            'geo_notice' => $this->defaultGeoNotice(),
            'enabled' => $enabled,
        ];
    }

    /** @return array<string, mixed> */
    public function getHub(int $tenantId): array
    {
        return $this->settings->get($tenantId, self::MODULE, 'hub', $this->defaultHub());
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function saveHub(int $tenantId, array $input): array
    {
        $current = $this->getHub($tenantId);
        if (isset($input['geo_notice']) && is_array($input['geo_notice'])) {
            $geo = $this->defaultGeoNotice();
            $geo['enabled'] = ($input['geo_notice']['enabled'] ?? $geo['enabled']) !== false;
            if (isset($input['geo_notice']['services']) && is_array($input['geo_notice']['services'])) {
                foreach (array_keys($geo['services']) as $key) {
                    if (array_key_exists($key, $input['geo_notice']['services'])) {
                        $geo['services'][$key] = (bool) $input['geo_notice']['services'][$key];
                    }
                }
            }
            $current['geo_notice'] = $geo;
        }
        if (isset($input['enabled']) && is_array($input['enabled'])) {
            foreach (self::GATEWAY_IDS as $id) {
                if (array_key_exists($id, $input['enabled'])) {
                    $current['enabled'][$id] = (bool) $input['enabled'][$id];
                }
            }
        }

        return $this->settings->put($tenantId, self::MODULE, 'hub', $current);
    }

    public function setGatewayEnabled(int $tenantId, string $gatewayId, bool $enabled): array
    {
        $hub = $this->getHub($tenantId);
        if (! in_array($gatewayId, self::GATEWAY_IDS, true)) {
            abort(422, 'Unknown gateway');
        }
        $hub['enabled'][$gatewayId] = $enabled;

        return $this->settings->put($tenantId, self::MODULE, 'hub', $hub);
    }

    public function isEnabled(int $tenantId, string $gatewayId): bool
    {
        $hub = $this->getHub($tenantId);

        return (bool) ($hub['enabled'][$gatewayId] ?? false);
    }

    /** @return array<string, mixed> */
    public function defaultsFor(string $provider): array
    {
        return match ($provider) {
            'zarinpal' => [
                'merchant_id' => '',
                'access_token' => '',
                'sandbox' => true,
                'gateway_enabled' => false,
                'title' => 'زرین‌پال',
                'description' => '',
                'instructions' => '',
                'success_message' => '',
                'failed_message' => '',
                'order_button_text' => '',
                'fee_label' => '',
                'cancelled_message' => '',
                'invalid_token_message' => '',
                'payment_description' => 'Order #{order_id}',
                'icon_url' => '',
                'fee_payer' => 'merchant',
                'redact_logs' => true,
            ],
            'digipay' => [
                'environment' => 'staging',
                'client_id' => '',
                'client_secret' => '',
                'username' => '',
                'password' => '',
                'digipay_version' => '2022-02-02',
                'seller_id' => '',
                'supplier_id' => '',
                'category_id' => '',
                'product_type' => 1,
                'preferred_gateway' => 2,
                'title_ipg' => 'دیجی‌پی',
                'description_ipg' => '',
                'title_wallet' => 'کیف پول دیجی‌پی',
                'description_wallet' => '',
                'title_cpg' => 'اعتبار دیجی‌پی',
                'description_cpg' => '',
                'title_bpg' => 'اقساط دیجی‌پی',
                'description_bpg' => '',
                'order_button_text' => '',
                'success_message' => '',
                'failed_message' => '',
                'cancelled_message' => '',
                'icon_url' => '',
            ],
            'snapppay' => [
                'base_url' => 'https://api.snapppay.ir',
                'client_id' => '',
                'client_secret' => '',
                'client_username' => '',
                'client_password' => '',
                'mobile_enabled' => true,
                'postal_enabled' => true,
                'default_gateway' => false,
                'has_comission' => false,
                'has_pdp' => false,
                'dark_pdp' => false,
                'direct_payment' => false,
                'title' => 'اسنپ‌پی',
                'description' => '',
                'success_message' => '',
                'failed_message' => '',
                'cancelled_message' => '',
            ],
            'torobpay' => [
                'base_url' => 'https://cpg.torobpay.com',
                'client_id' => '',
                'client_secret' => '',
                'client_username' => '',
                'client_password' => '',
                'mobile_enabled' => true,
                'postal_enabled' => true,
                'default_gateway' => false,
                'direct_payment' => false,
                'disable_payment_retry' => false,
                'utm_torob_enabled' => false,
                'utm_exclude_others' => false,
                'dns_smart_resolve_enabled' => false,
                'dns_ip_override' => '',
                'settle_enabled' => false,
                'title' => 'ترب‌پی',
                'description' => '',
                'success_message' => '',
                'failed_message' => '',
                'widget_enabled' => false,
                'badge_enabled' => false,
                'marquee_enabled' => false,
                'topbar_enabled' => false,
                'slider_enabled' => false,
            ],
            'bale_pay' => [
                'title' => 'بله پی',
                'description' => '',
                'instructions' => '',
                'order_button_text' => '',
                'success_message' => '',
                'failed_message' => '',
                'icon_url' => '',
            ],
            default => [],
        };
    }

    /** @return array<string, mixed> */
    public function getRaw(int $tenantId, string $provider): array
    {
        if (in_array($provider, ['wallet', 'c2c'], true)) {
            return $this->getLocalGateway($tenantId, $provider);
        }

        return $this->settings->get(
            $tenantId,
            self::MODULE,
            $provider,
            $this->defaultsFor($provider)
        );
    }

    /**
     * Public settings (secrets masked).
     *
     * @return array<string, mixed>
     */
    public function getPublic(int $tenantId, string $provider): array
    {
        $raw = $this->getRaw($tenantId, $provider);
        $out = $raw;
        foreach (self::SECRET_KEYS as $key) {
            if (array_key_exists($key, $out)) {
                $has = filled($out[$key] ?? null);
                unset($out[$key]);
                $out['has_'.$key] = $has;
            }
        }
        $out['callback_url'] = url('/api/v1/payments/callback/'.$this->callbackSlug($provider).'/{order}');
        if ($provider === 'snapppay' || $provider === 'torobpay') {
            $out['server_ip'] = request()?->server('SERVER_ADDR') ?: gethostbyname(gethostname() ?: 'localhost');
        }
        if ($provider === 'bale_pay') {
            $bot = BotSetting::query()
                ->where('tenant_id', $tenantId)
                ->where('provider', 'bale')
                ->first();
            $out['status'] = [
                'bot_active' => (bool) ($bot?->enabled && filled($bot?->token)),
                'has_provider_token' => filled($bot?->token),
                'bot_username' => (string) (($bot?->meta ?? [])['username'] ?? ''),
            ];
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, string $provider, array $input): array
    {
        if (in_array($provider, ['wallet', 'c2c'], true)) {
            return $this->saveLocalGateway($tenantId, $provider, $input);
        }

        $defaults = $this->defaultsFor($provider);
        if ($defaults === []) {
            abort(422, 'Unknown provider');
        }
        $current = $this->getRaw($tenantId, $provider);
        $merged = $current;
        foreach ($defaults as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            if (in_array($key, self::SECRET_KEYS, true)) {
                $val = $input[$key];
                if ($val === null || $val === '' || (is_string($val) && str_contains($val, '•'))) {
                    continue;
                }
                $merged[$key] = (string) $val;
                continue;
            }
            $merged[$key] = $this->castValue($input[$key], $default);
        }
        $this->settings->put($tenantId, self::MODULE, $provider, $merged);

        return $this->getPublic($tenantId, $provider);
    }

    public function configured(int $tenantId, string $provider): bool
    {
        if ($provider === BasalamPay::PROVIDER) {
            return BasalamPay::for($tenantId)->configured();
        }
        $raw = $this->getRaw($tenantId, $provider);

        return match ($provider) {
            'zarinpal' => filled($raw['merchant_id'] ?? null),
            'digipay' => filled($raw['client_id'] ?? null)
                && filled($raw['client_secret'] ?? null)
                && filled($raw['username'] ?? null)
                && filled($raw['password'] ?? null),
            'snapppay', 'torobpay' => filled($raw['client_id'] ?? null)
                && filled($raw['client_secret'] ?? null)
                && filled($raw['client_username'] ?? null)
                && filled($raw['client_password'] ?? null),
            'bale_pay' => BotSetting::query()
                ->where('tenant_id', $tenantId)
                ->where('provider', 'bale')
                ->where('enabled', true)
                ->whereNotNull('token')
                ->exists(),
            'wallet', 'c2c', 'cod' => true,
            default => false,
        };
    }

    /**
     * Hub rows for the settings UI.
     *
     * @return list<array<string, mixed>>
     */
    public function hubItems(int $tenantId): array
    {
        $hub = $this->getHub($tenantId);
        $catalog = [
            ['id' => 'zarinpal', 'title_key' => 'zarinpal', 'settings_path' => '/dashboard/settings/shop/zarinpal'],
            ['id' => 'digipay', 'title_key' => 'digipay', 'settings_path' => '/dashboard/settings/shop/digipay'],
            ['id' => 'snapppay', 'title_key' => 'snapppay', 'settings_path' => '/dashboard/settings/shop/snapppay'],
            ['id' => 'torobpay', 'title_key' => 'torobpay', 'settings_path' => '/dashboard/settings/shop/torobpay'],
            ['id' => 'bale_pay', 'title_key' => 'bale_pay', 'settings_path' => '/dashboard/settings/shop/bale-pay'],
            ['id' => 'basalam_pay', 'title_key' => 'basalam_pay', 'settings_path' => '/dashboard/settings/shop/marketplace/basalam?tab=settings'],
            ['id' => 'wallet', 'title_key' => 'wallet', 'settings_path' => '/dashboard/settings/shop/wallet'],
            ['id' => 'c2c', 'title_key' => 'c2c', 'settings_path' => '/dashboard/settings/shop/c2c'],
            ['id' => 'cod', 'title_key' => 'cod', 'settings_path' => '/dashboard/settings/shop/payments'],
        ];

        $items = [];
        foreach ($catalog as $row) {
            $id = $row['id'];
            $configured = $this->configured($tenantId, $id);
            $enabled = (bool) ($hub['enabled'][$id] ?? false);
            $available = $id === 'cod' || $id === 'wallet' || $id === 'c2c' || $configured || $id === 'bale_pay';
            $items[] = [
                'id' => $id,
                'title_key' => $row['title_key'],
                'gateway_id' => $id,
                'enabled' => $enabled,
                'available' => $available,
                'configured' => $configured,
                'settings_path' => $row['settings_path'],
            ];
        }

        return $items;
    }

    protected function callbackSlug(string $provider): string
    {
        return $provider === 'bale_pay' ? 'bale-pay' : $provider;
    }

    /** @return array<string, mixed> */
    protected function getLocalGateway(int $tenantId, string $provider): array
    {
        if ($provider === 'wallet') {
            $defaults = array_merge(WalletService::defaultSettings(), [
                'description' => '',
                'order_button_text' => '',
                'login_prompt' => '',
                'balance_label' => '',
                'icon_url' => '',
                'min_topup' => 10000,
            ]);
            $row = WalletSetting::query()->firstOrCreate(
                ['tenant_id' => $tenantId],
                ['payload' => $defaults]
            );
            $payload = array_merge($defaults, is_array($row->payload) ? $row->payload : []);
            if (! isset($payload['min_topup']) && isset($payload['min_topup_minor'])) {
                $payload['min_topup'] = (int) $payload['min_topup_minor'];
            }

            return $payload;
        }

        $defaults = array_merge(C2cController::defaultSettings(), [
            'order_button_text' => '',
            'icon_url' => '',
            'deadline_h' => 2,
        ]);
        $row = C2cSetting::query()->firstOrCreate(
            ['tenant_id' => $tenantId],
            ['payload' => $defaults]
        );
        $payload = array_merge($defaults, is_array($row->payload) ? $row->payload : []);
        if (! isset($payload['deadline_h']) && isset($payload['deadline_hours'])) {
            $payload['deadline_h'] = (int) $payload['deadline_hours'];
        }

        return $payload;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    protected function saveLocalGateway(int $tenantId, string $provider, array $input): array
    {
        $current = $this->getLocalGateway($tenantId, $provider);
        foreach ($input as $key => $value) {
            if ($key === 'has_access_token' || str_starts_with((string) $key, 'has_')) {
                continue;
            }
            if ($key === 'callback_url' || $key === 'server_ip' || $key === 'status') {
                continue;
            }
            $current[$key] = $value;
        }
        if ($provider === 'wallet') {
            if (isset($current['min_topup'])) {
                $current['min_topup_minor'] = (int) $current['min_topup'];
            }
            WalletSetting::query()->updateOrCreate(
                ['tenant_id' => $tenantId],
                ['payload' => $current]
            );
        } else {
            if (isset($current['deadline_h'])) {
                $current['deadline_hours'] = (int) $current['deadline_h'];
            }
            if (isset($current['cards']) && is_array($current['cards'])) {
                $current['cards'] = array_values(array_filter(
                    $current['cards'],
                    fn ($c) => is_array($c) && trim((string) ($c['number'] ?? '')) !== ''
                ));
            }
            C2cSetting::query()->updateOrCreate(
                ['tenant_id' => $tenantId],
                ['payload' => $current]
            );
        }

        return $this->getPublic($tenantId, $provider);
    }

    protected function castValue(mixed $value, mixed $default): mixed
    {
        if (is_bool($default)) {
            return (bool) $value;
        }
        if (is_int($default)) {
            return (int) $value;
        }
        if (is_float($default)) {
            return (float) $value;
        }

        return $value;
    }
}
