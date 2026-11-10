<?php

namespace App\Services\Payments;

use App\Http\Controllers\Api\V1\C2cController;
use App\Models\BotSetting;
use App\Models\C2cSetting;
use App\Models\WalletSetting;
use App\Services\Marketplace\Basalam\BasalamPay;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Orders\PosSettings;
use App\Services\Payments\Drivers\GatewayDriverRegistry;
use App\Services\Wallet\WalletService;

/**
 * Tenant payment gateway settings (hub + per-provider credentials).
 * Catalog: config/payment_gateways.php
 */
class PaymentGatewaySettingsService
{
    public const MODULE = 'payments';

    /**
     * @deprecated Prefer catalog()->ids() — kept for older call sites.
     *
     * @var list<string>
     */
    public const GATEWAY_IDS = [
        'zarinpal', 'zibal', 'digipay', 'snapppay', 'torobpay',
        'bale_pay', 'basalam_pay', 'wallet', 'c2c', 'cod',
    ];

    /**
     * Live commerce IPGs historically used at checkout.
     * Prefer catalog()->liveCommerceIds() for new code.
     *
     * @var list<string>
     */
    public const COMMERCE_GATEWAYS = ['zarinpal', 'zibal', 'digipay', 'snapppay', 'torobpay'];

    /** @var list<string> */
    public const SECRET_KEYS = [
        'access_token',
        'client_secret',
        'password',
        'client_password',
        'merchant_id',
        'api_key',
        'api_token',
        'secret_key',
        'terminal_key',
        'private_key',
        'public_key',
        'pin',
        'login_account',
        'webhook_secret',
        'ipn_secret',
        'publishable_key',
        'passphrase',
        'alternate_passphrase',
    ];

    public function __construct(
        protected ModuleSettingsService $settings,
        protected PaymentGatewayCatalog $catalog,
        protected GatewayDriverRegistry $drivers,
    ) {}

    public function catalog(): PaymentGatewayCatalog
    {
        return $this->catalog;
    }

    /** @return list<string> */
    public function gatewayIds(): array
    {
        return $this->catalog->ids();
    }

    /** @return list<string> */
    public function commerceGatewayIds(): array
    {
        return $this->catalog->commerceIds();
    }

    /** @return list<string> */
    public function liveCommerceGatewayIds(): array
    {
        return $this->catalog->liveCommerceIds();
    }

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
        foreach ($this->gatewayIds() as $id) {
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
        $hub = $this->settings->get($tenantId, self::MODULE, 'hub', $this->defaultHub());
        $enabled = is_array($hub['enabled'] ?? null) ? $hub['enabled'] : [];
        foreach ($this->gatewayIds() as $id) {
            if (! array_key_exists($id, $enabled)) {
                $enabled[$id] = $id === 'cod';
            }
        }
        $hub['enabled'] = $enabled;
        if (! isset($hub['geo_notice']) || ! is_array($hub['geo_notice'])) {
            $hub['geo_notice'] = $this->defaultGeoNotice();
        }

        return $hub;
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
            foreach ($this->gatewayIds() as $id) {
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
        if (! $this->catalog->has($gatewayId)) {
            abort(422, 'Unknown gateway');
        }
        $hub['enabled'][$gatewayId] = $enabled;
        $saved = $this->settings->put($tenantId, self::MODULE, 'hub', $hub);
        $this->syncPosGatewayMapping($tenantId);

        return $saved;
    }

    /**
     * Drop disabled / unknown gateway ids from POS online tender mappings.
     */
    public function syncPosGatewayMapping(int $tenantId): void
    {
        try {
            $pos = app(PosSettings::class);
        } catch (\Throwable) {
            return;
        }
        $current = $pos->get($tenantId);
        $methods = $current['payment_methods'] ?? [];
        if (! is_array($methods)) {
            return;
        }
        $allowed = [];
        foreach ($this->gatewayIds() as $id) {
            if ($this->isEnabled($tenantId, $id)) {
                $allowed[] = $id;
            }
        }
        $allowed[] = 'card_to_card';
        $allowed = array_values(array_unique($allowed));
        $changed = false;
        foreach ($methods as $i => $method) {
            if (! is_array($method) || ($method['type'] ?? '') !== 'online') {
                continue;
            }
            $ids = is_array($method['gateway_ids'] ?? null) ? $method['gateway_ids'] : [];
            $filtered = array_values(array_filter(
                $ids,
                fn ($gid) => in_array(str_replace('-', '_', strtolower((string) $gid)), $allowed, true)
            ));
            if ($filtered !== $ids) {
                $methods[$i]['gateway_ids'] = $filtered;
                $changed = true;
            }
        }
        if ($changed) {
            $pos->put($tenantId, ['payment_methods' => $methods]);
        }
    }

    public function isEnabled(int $tenantId, string $gatewayId): bool
    {
        $hub = $this->getHub($tenantId);

        return (bool) ($hub['enabled'][$gatewayId] ?? false);
    }

    /** @return array<string, mixed> */
    public function defaultsFor(string $provider): array
    {
        $fromCatalog = $this->catalog->defaults($provider);
        if ($fromCatalog !== []) {
            return $fromCatalog;
        }

        // Legacy fallbacks for digipay/snapp/torob detailed fields already in catalog.
        return [];
    }

    /** @return array<string, mixed> */
    public function getRaw(int $tenantId, string $provider): array
    {
        if (in_array($provider, ['wallet', 'c2c'], true)) {
            return $this->getLocalGateway($tenantId, $provider);
        }
        if ($provider === 'cod') {
            return $this->settings->get($tenantId, self::MODULE, 'cod', $this->defaultsFor('cod'));
        }

        return $this->settings->get(
            $tenantId,
            self::MODULE,
            $provider,
            $this->defaultsFor($provider)
        );
    }

    /**
     * Public settings (secrets masked) + form schema for the settings UI.
     *
     * @return array<string, mixed>
     */
    public function getPublic(int $tenantId, string $provider): array
    {
        if (! $this->catalog->has($provider) && ! in_array($provider, ['wallet', 'c2c', 'cod', 'bale_pay', 'basalam_pay'], true)) {
            abort(422, 'Unknown provider');
        }

        $raw = $this->getRaw($tenantId, $provider);
        $out = $raw;
        $secretKeys = array_unique(array_merge(self::SECRET_KEYS, $this->catalog->secretKeys()));
        foreach ($secretKeys as $key) {
            if (array_key_exists($key, $out)) {
                $has = filled($out[$key] ?? null);
                unset($out[$key]);
                $out['has_'.$key] = $has;
            }
        }
        if ($provider !== 'cheque') {
            $out['callback_url'] = url('/api/v1/payments/callback/'.$this->callbackSlug($provider).'/{order}');
        }
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
                'has_provider_token' => filled($this->getRaw($tenantId, 'bale_pay')['provider_token'] ?? null),
                'bot_username' => (string) (($bot?->meta ?? [])['username'] ?? ''),
            ];
        }

        $meta = $this->catalog->get($provider) ?? [];
        $status = (string) ($meta['status'] ?? 'live');
        $comingSoon = $status === 'scaffold';
        $out['_meta'] = [
            'id' => $provider,
            'status' => $status,
            'category' => $meta['category'] ?? 'other',
            'label_fa' => $meta['label_fa'] ?? $provider,
            'label_en' => $meta['label_en'] ?? $provider,
            'docs_url' => $this->catalog->docsUrl($provider),
            'fields' => $this->catalog->fields($provider),
            'supports' => $meta['supports'] ?? ['cash'],
            'coming_soon' => $comingSoon,
            'testable' => true,
        ];

        return $out;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, string $provider, array $input): array
    {
        if (! $this->catalog->has($provider)) {
            abort(422, 'Unknown provider');
        }
        if (in_array($provider, ['wallet', 'c2c'], true)) {
            return $this->saveLocalGateway($tenantId, $provider, $input);
        }

        $defaults = $this->defaultsFor($provider);
        if ($defaults === [] && $provider !== 'basalam_pay') {
            // Allow empty defaults only for marketplace-linked providers.
            if ($provider !== 'cod') {
                // still allow saving title/description overlays
                $defaults = ['title' => '', 'description' => ''];
            }
        }
        if ($provider === 'basalam_pay') {
            abort(422, 'Configure Basalam Pay from marketplace settings');
        }

        $current = $this->getRaw($tenantId, $provider);
        $merged = $current;
        $secretKeys = array_unique(array_merge(self::SECRET_KEYS, $this->catalog->secretKeys()));
        $allowedKeys = array_unique(array_merge(array_keys($defaults), array_keys($current)));
        foreach ($allowedKeys as $key) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            if (in_array($key, $secretKeys, true)) {
                $val = $input[$key];
                if ($val === null || $val === '' || (is_string($val) && str_contains($val, '•'))) {
                    continue;
                }
                $merged[$key] = (string) $val;
                continue;
            }
            $default = $defaults[$key] ?? $current[$key] ?? '';
            $merged[$key] = $this->castValue($input[$key], $default);
        }
        // Accept any extra non-secret keys from catalog fields not yet in defaults.
        foreach ($this->catalog->fields($provider) as $field) {
            $key = (string) ($field['key'] ?? '');
            if ($key === '' || $key === 'callback_url' || $key === 'server_ip') {
                continue;
            }
            if (! array_key_exists($key, $input)) {
                continue;
            }
            if (in_array($key, $secretKeys, true)) {
                $val = $input[$key];
                if ($val === null || $val === '' || (is_string($val) && str_contains($val, '•'))) {
                    continue;
                }
                $merged[$key] = (string) $val;
                continue;
            }
            $type = (string) ($field['type'] ?? 'text');
            $merged[$key] = match ($type) {
                'switch' => (bool) $input[$key],
                'number' => is_numeric($input[$key]) ? 0 + $input[$key] : 0,
                default => $input[$key],
            };
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

    /**
     * @param  array<string, mixed>  $config
     * @return array{ok: bool, message: string}
     */
    public function testConnection(int $tenantId, string $provider): array
    {
        $raw = $this->getRaw($tenantId, $provider);
        $driver = $this->drivers->get($provider);
        if ($driver) {
            return $driver->testConnection($raw);
        }
        if ($this->configured($tenantId, $provider)) {
            return ['ok' => true, 'message' => 'پیکربندی کامل است.'];
        }

        return ['ok' => false, 'message' => 'اعتبارنامه ناقص است.'];
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
     * Enabled, configured, live commerce gateways safe to show at checkout.
     *
     * @return list<array<string, mixed>>
     */
    /** Optional merchant-uploaded logo for a gateway (absolute or site-relative URL only). */
    protected function logoUrl(array $raw): ?string
    {
        $url = trim((string) ($raw['logo_url'] ?? $raw['logo'] ?? ''));
        if ($url === '' || ! (str_starts_with($url, '/') || preg_match('#^https?://#i', $url))) {
            return null;
        }

        return $url;
    }

    public function checkoutGateways(int $tenantId, ?string $mode = null): array
    {
        $out = [];
        foreach ($this->liveCommerceGatewayIds() as $id) {
            if (! $this->isEnabled($tenantId, $id) || ! $this->configured($tenantId, $id)) {
                continue;
            }
            $raw = $this->getRaw($tenantId, $id);
            $cash = (bool) ($raw['cash_enabled'] ?? false);
            $installment = (bool) ($raw['installment_enabled'] ?? false);
            // Local/wallet-style may omit flags — treat as cash.
            if (! array_key_exists('cash_enabled', $raw) && ! array_key_exists('installment_enabled', $raw)) {
                $cash = true;
            }
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
            if ($title === '') {
                $title = (string) ($this->catalog->get($id)['label_fa'] ?? $id);
            }
            $out[] = [
                'id' => $id,
                'title' => $title,
                'title_key' => $id,
                'label_en' => (string) ($this->catalog->get($id)['label_en'] ?? $id),
                'category' => (string) ($this->catalog->get($id)['category'] ?? 'other'),
                'logo_url' => $this->logoUrl($raw),
                'cash_enabled' => $cash,
                'installment_enabled' => $installment,
                'fee_percent' => $this->feePercent($raw),
                'fee_payer' => (string) ($raw['fee_payer'] ?? 'merchant'),
                'sandbox' => $this->isSandbox($id, $raw),
                'status' => 'live',
            ];
        }

        // Offline / local tenders (COD etc.) belong on the same checkout list.
        if ($mode === null || $mode === 'cash') {
            $offlineTitles = [
                'cod' => 'پرداخت در محل',
                'cheque' => 'پرداخت با چک',
                'wallet' => 'کیف پول',
                'c2c' => 'کارت به کارت',
            ];
            foreach ($offlineTitles as $id => $fallbackTitle) {
                if (! $this->isEnabled($tenantId, $id) || ! $this->configured($tenantId, $id)) {
                    continue;
                }
                $raw = $this->getRaw($tenantId, $id);
                $title = (string) ($raw['title'] ?? '');
                $out[] = [
                    'id' => $id,
                    'title' => $title !== '' ? $title : $fallbackTitle,
                    'title_key' => $id,
                    'label_en' => (string) ($this->catalog->get($id)['label_en'] ?? $id),
                    'category' => 'other',
                    'logo_url' => $this->logoUrl($raw),
                    'cash_enabled' => true,
                    'installment_enabled' => false,
                    'fee_percent' => 0.0,
                    'fee_payer' => 'merchant',
                    'sandbox' => false,
                    'kind' => 'offline',
                ];
            }
        }

        return $out;
    }

    public function configured(int $tenantId, string $provider): bool
    {
        if ($provider === BasalamPay::PROVIDER) {
            return BasalamPay::for($tenantId)->configured();
        }
        $required = $this->catalog->required($provider);
        if ($required === []) {
            return match ($provider) {
                'bale_pay' => BotSetting::query()
                    ->where('tenant_id', $tenantId)
                    ->where('provider', 'bale')
                    ->where('enabled', true)
                    ->whereNotNull('token')
                    ->exists(),
                'wallet', 'c2c', 'cod' => true,
                default => true,
            };
        }
        $raw = $this->getRaw($tenantId, $provider);
        foreach ($required as $key) {
            // snapp/torob use client_username/client_password in stored settings
            $aliases = match ($key) {
                'client_username' => ['client_username', 'username'],
                'client_password' => ['client_password', 'password'],
                default => [$key],
            };
            $ok = false;
            foreach ($aliases as $alias) {
                if (filled($raw[$alias] ?? null)) {
                    $ok = true;
                    break;
                }
            }
            if (! $ok) {
                return false;
            }
        }

        return true;
    }

    /**
     * Hub rows for the settings UI, grouped by category.
     *
     * @return array{categories: list<array<string, mixed>>, items: list<array<string, mixed>>}
     */
    public function hubPayload(int $tenantId): array
    {
        $hub = $this->getHub($tenantId);
        $items = [];
        foreach ($this->catalog->all() as $id => $meta) {
            $configured = $this->configured($tenantId, $id);
            $enabled = (bool) ($hub['enabled'][$id] ?? false);
            $status = (string) ($meta['status'] ?? 'scaffold');
            $local = ! empty($meta['local']);
            $comingSoon = $status === 'scaffold';
            // Live + scaffold gateways stay available in the hub for credential storage / toggle.
            // Checkout still requires enabled + configured (+ live driver) before charging.
            $available = true;
            $items[] = [
                'id' => $id,
                'title_key' => $id,
                'label_fa' => $meta['label_fa'] ?? $id,
                'label_en' => $meta['label_en'] ?? $id,
                'category' => $meta['category'] ?? 'other',
                'gateway_id' => $id,
                'enabled' => $enabled,
                'available' => $available,
                'configured' => $configured,
                'status' => $status,
                'coming_soon' => $comingSoon,
                'docs_url' => $this->catalog->docsUrl($id),
                'supports' => $meta['supports'] ?? ['cash'],
                'settings_path' => $this->catalog->settingsPath($id),
            ];
        }

        $categories = [];
        foreach ($this->catalog->categories() as $catId => $cat) {
            $categories[] = [
                'id' => $catId,
                'label_fa' => $cat['label_fa'],
                'label_en' => $cat['label_en'],
                'order' => $cat['order'] ?? 100,
            ];
        }

        return [
            'categories' => $categories,
            'items' => $items,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function hubItems(int $tenantId): array
    {
        return $this->hubPayload($tenantId)['items'];
    }

    protected function callbackSlug(string $provider): string
    {
        return str_replace('_', '-', $provider);
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
            ], $this->defaultsFor('wallet'));
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
            'smart_verify' => true,
        ], $this->defaultsFor('c2c'));
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
            if ($key === 'callback_url' || $key === 'server_ip' || $key === 'status' || $key === '_meta') {
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
