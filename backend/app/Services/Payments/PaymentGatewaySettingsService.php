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
        'zibal',
        'digipay',
        'snapppay',
        'torobpay',
        'bale_pay',
        'basalam_pay',
        'wallet',
        'c2c',
        'cod',
    ];

    /** Site commerce IPGs configured on «درگاه‌های پرداخت». */
    public const COMMERCE_GATEWAYS = ['zarinpal', 'zibal', 'digipay', 'snapppay', 'torobpay'];

    /** @var list<string> */
    public const SECRET_KEYS = [
        'access_token',
        'client_secret',
        'password',
        'client_password',
    ];

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array{enabled: bool, services: array<string, bool>, colors: array<string, string>} */
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
            'colors' => [
                'bg' => '#fff7ed',
                'border' => '#fdba74',
                'text' => '#9a3412',
                'icon' => '#ea580c',
                'button_bg' => '#ea580c',
                'button_text' => '#ffffff',
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
            $existing = is_array($current['geo_notice'] ?? null) ? $current['geo_notice'] : [];
            $geo['enabled'] = ($input['geo_notice']['enabled'] ?? $existing['enabled'] ?? $geo['enabled']) !== false;
            if (isset($input['geo_notice']['services']) && is_array($input['geo_notice']['services'])) {
                foreach (array_keys($geo['services']) as $key) {
                    if (array_key_exists($key, $input['geo_notice']['services'])) {
                        $geo['services'][$key] = (bool) $input['geo_notice']['services'][$key];
                    } elseif (isset($existing['services'][$key])) {
                        $geo['services'][$key] = (bool) $existing['services'][$key];
                    }
                }
            } elseif (isset($existing['services']) && is_array($existing['services'])) {
                $geo['services'] = array_merge($geo['services'], $existing['services']);
            }
            $colorsIn = $input['geo_notice']['colors'] ?? ($existing['colors'] ?? []);
            if (is_array($colorsIn)) {
                foreach (array_keys($geo['colors']) as $ck) {
                    $raw = $colorsIn[$ck] ?? null;
                    if (is_string($raw) && preg_match('/^#?[0-9a-fA-F]{6}$/', trim($raw))) {
                        $v = trim($raw);
                        $geo['colors'][$ck] = str_starts_with($v, '#') ? strtolower($v) : '#'.strtolower($v);
                    } elseif (isset($existing['colors'][$ck])) {
                        $geo['colors'][$ck] = $existing['colors'][$ck];
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
            'zibal' => [
                'merchant_id' => '',
                'title' => 'زیبال',
                'payment_description' => 'Order #{order_id}',
                'fee_payer' => 'merchant',
                'fee_percent' => 0.0,
                'cash_enabled' => true,
                'installment_enabled' => false,
            ],
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
                'fee_percent' => 0.0,
                'cash_enabled' => true,
                'installment_enabled' => false,
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
                'preferred_gateway_installment' => 5,
                'fee_percent' => 0.0,
                'fee_payer' => 'merchant',
                'cash_enabled' => true,
                'installment_enabled' => true,
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
                'sandbox' => false,
                'fee_percent' => 0.0,
                'fee_payer' => 'customer',
                'cash_enabled' => false,
                'installment_enabled' => true,
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
                'sandbox' => false,
                'fee_percent' => 0.0,
                'fee_payer' => 'customer',
                'cash_enabled' => false,
                'installment_enabled' => true,
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
        if (array_key_exists('fee_percent', $merged)) {
            $merged['fee_percent'] = $this->feePercent($merged);
        }
        if (isset($merged['fee_payer']) && ! in_array((string) $merged['fee_payer'], ['merchant', 'customer'], true)) {
            $merged['fee_payer'] = 'merchant';
        }
        $this->settings->put($tenantId, self::MODULE, $provider, $merged);

        return $this->getPublic($tenantId, $provider);
    }

    public function feePercent(array $settings): float
    {
        $percent = round((float) ($settings['fee_percent'] ?? 0), 2);

        return max(0, min(100, $percent));
    }

    public function supportsMode(array $settings, string $mode): bool
    {
        return match ($mode) {
            'cash' => (bool) ($settings['cash_enabled'] ?? false),
            'installment' => (bool) ($settings['installment_enabled'] ?? false),
            default => false,
        };
    }

    /**
     * Fee preview in store minor units. Customer-paid fees increase the charged total.
     *
     * @param  array<string, mixed>  $settings
     * @return array{fee_percent: float, fee_payer: string, fee_minor: int, base_minor: int, charge_minor: int}
     */
    public function feeQuote(array $settings, int $baseMinor): array
    {
        $baseMinor = max(0, $baseMinor);
        $percent = $this->feePercent($settings);
        $payer = (string) ($settings['fee_payer'] ?? 'merchant');
        if (! in_array($payer, ['merchant', 'customer'], true)) {
            $payer = 'merchant';
        }
        $fee = (int) round($baseMinor * $percent / 100);

        return [
            'fee_percent' => $percent,
            'fee_payer' => $payer,
            'fee_minor' => $fee,
            'base_minor' => $baseMinor,
            'charge_minor' => $payer === 'customer' ? $baseMinor + $fee : $baseMinor,
        ];
    }

    public function isSandbox(string $provider, array $settings): bool
    {
        if ($provider === 'digipay') {
            return (string) ($settings['environment'] ?? 'staging') !== 'live';
        }

        return (bool) ($settings['sandbox'] ?? false);
    }

    /**
     * Enabled, configured commerce gateways safe to show at checkout.
     *
     * @return list<array<string, mixed>>
     */
    public function checkoutGateways(int $tenantId, ?string $mode = null): array
    {
        $out = [];
        foreach (self::COMMERCE_GATEWAYS as $id) {
            if (! $this->isEnabled($tenantId, $id) || ! $this->configured($tenantId, $id)) {
                continue;
            }
            $raw = $this->getRaw($tenantId, $id);
            $cash = (bool) ($raw['cash_enabled'] ?? false);
            $installment = (bool) ($raw['installment_enabled'] ?? false);
            if ($mode === 'cash' && ! $cash) {
                continue;
            }
            if ($mode === 'installment' && ! $installment) {
                continue;
            }
            if (! $cash && ! $installment) {
                continue;
            }
            $title = (string) ($raw['title'] ?? '');
            if ($title === '' && $id === 'digipay') {
                $title = (string) ($raw['title_ipg'] ?? 'دیجی‌پی');
            }
            $out[] = [
                'id' => $id,
                'title' => $title !== '' ? $title : $id,
                'cash_enabled' => $cash,
                'installment_enabled' => $installment,
                'fee_percent' => $this->feePercent($raw),
                'fee_payer' => (string) ($raw['fee_payer'] ?? 'merchant'),
                'sandbox' => $this->isSandbox($id, $raw),
            ];
        }

        return $out;
    }

    public function configured(int $tenantId, string $provider): bool
    {
        if ($provider === BasalamPay::PROVIDER) {
            return BasalamPay::for($tenantId)->configured();
        }
        $raw = $this->getRaw($tenantId, $provider);

        return match ($provider) {
            'zarinpal', 'zibal' => filled($raw['merchant_id'] ?? null),
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
            ['id' => 'zibal', 'title_key' => 'zibal', 'settings_path' => '/dashboard/settings/shop/zibal'],
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
                'min_topup' => 1000,
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
