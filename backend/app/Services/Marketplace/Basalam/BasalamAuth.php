<?php

namespace App\Services\Marketplace\Basalam;

use App\Models\Tenant;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Basalam OAuth through the Webino ERP (central app holding the client secret).
 * Port of OAuthManager: start / signed handoff (180s) / manual tokens / refresh / disconnect.
 */
class BasalamAuth
{
    public const PLATFORM = 'basalam';

    public const HANDOFF_MAX_AGE = 180;

    public const PENDING_TTL = 600;

    public const CALLBACK_PATH = '/api/v1/public/marketplace/basalam/oauth/callback';

    public const PANEL_PATH = '/dashboard/settings/shop/marketplace/basalam';

    public function __construct(
        protected int $tenantId,
        protected MarketplaceSettingsService $settings,
    ) {}

    public static function for(int $tenantId): self
    {
        return new self($tenantId, app(MarketplaceSettingsService::class));
    }

    /** Public https origin of the tenant store (what the ERP signs the handoff for). */
    public static function siteUrl(int $tenantId): string
    {
        $tenant = Tenant::query()->find($tenantId);
        if ($tenant?->domain) {
            return 'https://'.preg_replace('#^https?://#', '', rtrim((string) $tenant->domain, '/'));
        }

        return rtrim((string) config('app.url'), '/');
    }

    public function erpBase(): string
    {
        $base = (string) (config('services.webino.basalam_oauth_base') ?: config('services.webino.base_url'));

        return rtrim($base, '/');
    }

    /** @return array<string, mixed> */
    public function credentials(): array
    {
        return $this->settings->credentials($this->tenantId, self::PLATFORM);
    }

    /** @return array<string, mixed> */
    public function state(): array
    {
        return $this->settings->state($this->tenantId, self::PLATFORM);
    }

    public function token(): string
    {
        return trim((string) ($this->credentials()['access_token'] ?? ''));
    }

    public function refreshToken(): string
    {
        return trim((string) ($this->credentials()['refresh_token'] ?? ''));
    }

    public function vendorId(): int
    {
        return max(0, (int) ($this->credentials()['vendor_id'] ?? 0));
    }

    public function isConnected(): bool
    {
        return $this->token() !== '' && $this->vendorId() > 0 && ($this->state()['is_vendor'] ?? true) !== false;
    }

    /** @return array<string, mixed> */
    public function status(): array
    {
        $state = $this->state();

        return [
            'connected' => $this->isConnected(),
            'has_token' => $this->token() !== '',
            'has_refresh' => $this->refreshToken() !== '',
            'vendor_id' => $this->vendorId() ?: null,
            'is_vendor' => ($state['is_vendor'] ?? true) !== false,
            'expires_at' => isset($state['expires_at']) ? Carbon::createFromTimestamp((int) $state['expires_at'])->toIso8601String() : null,
            'connected_at' => $state['connected_at'] ?? null,
            'auth_error' => $state['auth_error'] ?? null,
            'auth_error_at' => $state['auth_error_at'] ?? null,
            'oauth_available' => $this->erpBase() !== '',
        ];
    }

    /**
     * Ask the ERP for a Basalam SSO URL; the ERP redirects back to our public callback with a signed handoff.
     *
     * @return array{url: string, redirect_uri: string, client_id: string, return_url: string}
     */
    public function start(string $returnUrl = ''): array
    {
        if ($this->erpBase() === '') {
            throw new MarketplaceException(__('marketplace.basalam_oauth_unconfigured'), 503);
        }
        $site = self::siteUrl($this->tenantId);
        $returnUrl = $this->safeReturnUrl($returnUrl);

        try {
            $response = Http::timeout(30)->acceptJson()->asJson()->post($this->erpBase().'/api/v1/marketplace/basalam/oauth/start', [
                'site_url' => $site,
                'return_url' => $returnUrl,
                'handoff_path' => self::CALLBACK_PATH,
            ]);
        } catch (Throwable $e) {
            throw new MarketplaceException(__('marketplace.basalam_oauth_start_failed', ['error' => $e->getMessage()]), 502);
        }
        $data = (array) $response->json();
        if (! $response->successful() || empty($data['url'])) {
            throw new MarketplaceException(__('marketplace.basalam_oauth_start_failed', ['error' => (string) ($data['message'] ?? $response->status())]), 502);
        }

        $this->settings->putState($this->tenantId, self::PLATFORM, [
            'oauth_pending' => [
                'handoff_key' => (string) ($data['handoff_key'] ?? ''),
                'created' => time(),
                'return_url' => $returnUrl,
            ],
        ]);

        return [
            'url' => (string) $data['url'],
            'redirect_uri' => (string) ($data['redirect_uri'] ?? ''),
            'client_id' => (string) ($data['client_id'] ?? ''),
            'return_url' => $returnUrl,
        ];
    }

    /** Only same-host dashboard paths are accepted as a post-connect return target. */
    public function safeReturnUrl(string $url): string
    {
        $site = self::siteUrl($this->tenantId);
        $url = trim($url);
        if ($url === '') {
            return $site.self::PANEL_PATH;
        }
        $host = parse_url($url, PHP_URL_HOST);
        $path = (string) parse_url($url, PHP_URL_PATH);
        if (! is_string($host) || strcasecmp($host, (string) parse_url($site, PHP_URL_HOST)) !== 0 || ! str_starts_with($path, '/dashboard')) {
            return $site.self::PANEL_PATH;
        }
        $query = [];
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        foreach (['oauth', 'access_token', 'refresh_token', 'vendor_id', 'webino_sig', 'webino_ts', 'webino_hk', 'reason', 'expires_in', 'is_vendor'] as $k) {
            unset($query[$k]);
        }

        return $site.$path.($query ? '?'.http_build_query($query) : '');
    }

    /**
     * Complete a signed handoff. `$public` = arrived on the unauthenticated callback, so a pending
     * start (≤10 min) is required and the key issued to us server-to-server is used for the HMAC.
     *
     * @param  array<string, mixed>  $query
     * @return array{return_url: string}
     */
    public function completeHandoff(array $query, bool $public): array
    {
        $state = $this->state();
        $pending = is_array($state['oauth_pending'] ?? null) ? $state['oauth_pending'] : null;
        if ($pending && time() - (int) ($pending['created'] ?? 0) > self::PENDING_TTL) {
            $pending = null;
        }
        if ($public && ! $pending) {
            throw new MarketplaceException(__('marketplace.basalam_oauth_session_expired'), 403);
        }

        $access = trim((string) ($query['access_token'] ?? ''));
        $refresh = trim((string) ($query['refresh_token'] ?? ''));
        $vendor = (string) max(0, (int) ($query['vendor_id'] ?? 0));
        $isVendor = strtolower((string) ($query['is_vendor'] ?? 'true')) !== 'false';
        $expires = isset($query['expires_in']) ? max(0, (int) $query['expires_in']) : null;

        $sig = (string) ($query['webino_sig'] ?? '');
        $ts = (int) ($query['webino_ts'] ?? 0);
        $key = (string) (($pending['handoff_key'] ?? '') ?: ($query['webino_hk'] ?? ''));
        if ($public || $sig !== '') {
            if ($sig === '' || $key === '' || $ts < 1 || time() - $ts > self::HANDOFF_MAX_AGE) {
                throw new MarketplaceException(__('marketplace.basalam_oauth_sig_expired'), 403);
            }
            $payload = $access.'|'.$refresh.'|'.$ts.'|'.$vendor.'|'.self::siteUrl($this->tenantId);
            if (! hash_equals(hash_hmac('sha256', $payload, $key), $sig)) {
                throw new MarketplaceException(__('marketplace.basalam_oauth_sig_invalid'), 403);
            }
        }

        if ($access === '') {
            throw new MarketplaceException(__('marketplace.basalam_oauth_no_token'), 400);
        }
        if (! $isVendor) {
            $this->settings->putState($this->tenantId, self::PLATFORM, ['is_vendor' => false, 'oauth_pending' => null]);
            throw new MarketplaceException(__('marketplace.basalam_not_vendor'), 400);
        }
        if ((int) $vendor < 1) {
            throw new MarketplaceException(__('marketplace.basalam_oauth_vendor'), 400);
        }

        $this->storeTokens($access, $refresh, (int) $vendor, $expires);
        $returnUrl = (string) ($pending['return_url'] ?? '') ?: $this->safeReturnUrl('');
        $this->settings->putState($this->tenantId, self::PLATFORM, ['oauth_pending' => null]);
        $this->afterConnect();

        return ['return_url' => $returnUrl];
    }

    /**
     * Parse a pasted return URL (or bare query string) and complete the handoff.
     */
    public function completeFromCallbackUrl(string $callbackUrl): void
    {
        $callbackUrl = trim($callbackUrl);
        if ($callbackUrl === '') {
            throw new MarketplaceException(__('marketplace.basalam_oauth_empty'), 400);
        }
        $query = [];
        $qs = parse_url($callbackUrl, PHP_URL_QUERY);
        if (is_string($qs) && $qs !== '') {
            parse_str($qs, $query);
        } elseif (str_contains($callbackUrl, '=')) {
            parse_str(ltrim($callbackUrl, '?'), $query);
        }
        if (trim((string) ($query['access_token'] ?? '')) === '') {
            throw new MarketplaceException(__('marketplace.basalam_oauth_no_token'), 400);
        }
        $this->completeHandoff($query, false);
    }

    /** Manual token entry for testing / recovery. */
    public function saveManual(string $access, string $refresh = '', ?int $vendorId = null, ?int $expiresIn = null): void
    {
        $access = trim($access);
        if ($access === '') {
            throw new MarketplaceException(__('marketplace.basalam_token_required'), 422);
        }
        $this->storeTokens($access, trim($refresh), $vendorId ?: 0, $expiresIn);
        if ($this->vendorId() < 1) {
            $this->ensureVendorId();
        }
        $this->afterConnect();
    }

    protected function storeTokens(string $access, string $refresh, int $vendorId, ?int $expiresIn): void
    {
        $patch = ['access_token' => $access, 'refresh_token' => $refresh];
        if ($vendorId > 0) {
            $patch['vendor_id'] = (string) $vendorId;
        }
        $this->settings->patchCredentials($this->tenantId, self::PLATFORM, $patch);
        $this->settings->putState($this->tenantId, self::PLATFORM, [
            'expires_at' => $expiresIn ? time() + $expiresIn : null,
            'is_vendor' => true,
            'connected_at' => now()->toIso8601String(),
            'auth_error' => null,
            'auth_error_at' => null,
        ]);
        MarketplaceLogger::info($this->tenantId, self::PLATFORM, 'auth', 'Basalam connected', ['vendor_id' => $vendorId ?: null]);
    }

    /** Webhook registration and booth info refresh; failures are logged and retried from the UI. */
    protected function afterConnect(): void
    {
        try {
            (new BasalamWebhooks($this->tenantId, new BasalamClient($this->tenantId, $this->settings)))->setup();
        } catch (Throwable $e) {
            MarketplaceLogger::warning($this->tenantId, self::PLATFORM, 'webhook', 'Webhook setup after connect failed: '.$e->getMessage());
        }
        try {
            (new BasalamBooth(new BasalamClient($this->tenantId, $this->settings)))->vendor(true);
        } catch (Throwable $e) {
            MarketplaceLogger::warning($this->tenantId, self::PLATFORM, 'booth', 'Vendor fetch after connect failed: '.$e->getMessage());
        }
    }

    /** Refresh through the ERP (client_secret never leaves it). */
    public function refresh(): void
    {
        $refresh = $this->refreshToken();
        if ($refresh === '') {
            throw new MarketplaceException(__('marketplace.basalam_refresh_missing'), 401);
        }
        if ($this->erpBase() === '') {
            throw new MarketplaceException(__('marketplace.basalam_oauth_unconfigured'), 503);
        }
        try {
            $response = Http::timeout(30)->acceptJson()->asJson()->post($this->erpBase().'/api/v1/marketplace/basalam/oauth/refresh', array_filter([
                'refresh_token' => $refresh,
                'site_url' => self::siteUrl($this->tenantId),
                'vendor_id' => $this->vendorId() ?: null,
            ]));
        } catch (Throwable $e) {
            throw new MarketplaceException(__('marketplace.basalam_refresh_failed', ['error' => $e->getMessage()]), 0);
        }
        $data = (array) $response->json();
        if (! $response->successful() || empty($data['access_token'])) {
            $message = (string) ($data['message'] ?? $response->status());
            $this->markAuthError($message);
            throw new MarketplaceException(__('marketplace.basalam_refresh_failed', ['error' => $message]), $response->status() >= 500 ? $response->status() : 401);
        }

        $this->settings->patchCredentials($this->tenantId, self::PLATFORM, [
            'access_token' => (string) $data['access_token'],
            'refresh_token' => (string) (($data['refresh_token'] ?? '') ?: $refresh),
        ]);
        $this->settings->putState($this->tenantId, self::PLATFORM, [
            'expires_at' => ! empty($data['expires_in']) ? time() + (int) $data['expires_in'] : null,
            'refreshed_at' => now()->toIso8601String(),
            'auth_error' => null,
            'auth_error_at' => null,
        ]);
        MarketplaceLogger::info($this->tenantId, self::PLATFORM, 'auth', 'Basalam token refreshed');
    }

    /** Current token, refreshed first when it expires within 5 minutes. */
    public function accessToken(): string
    {
        $token = $this->token();
        $expires = (int) ($this->state()['expires_at'] ?? 0);
        if ($token !== '' && $expires > 0 && $expires - 300 < time() && $this->refreshToken() !== '') {
            try {
                $this->refresh();
                $token = $this->token();
            } catch (MarketplaceException) {
            }
        }

        return $token;
    }

    public function expiresWithin(int $seconds): bool
    {
        $expires = (int) ($this->state()['expires_at'] ?? 0);

        return $expires > 0 && $expires - $seconds < time();
    }

    public function disconnect(): void
    {
        $this->settings->patchCredentials($this->tenantId, self::PLATFORM, [
            'access_token' => '',
            'refresh_token' => '',
            'vendor_id' => '',
        ]);
        $this->settings->putState($this->tenantId, self::PLATFORM, [
            'expires_at' => null,
            'is_vendor' => false,
            'webhook_id' => null,
            'vendor' => null,
            'auth_error' => null,
            'auth_error_at' => null,
            'oauth_pending' => null,
            'disconnected_at' => now()->toIso8601String(),
        ]);
        MarketplaceLogger::info($this->tenantId, self::PLATFORM, 'auth', 'Basalam disconnected');
        if ($this->erpBase() !== '') {
            try {
                Http::timeout(8)->acceptJson()->asJson()->post($this->erpBase().'/api/v1/marketplace/basalam/oauth/disconnect', [
                    'site_url' => self::siteUrl($this->tenantId),
                ]);
            } catch (Throwable) {
            }
        }
    }

    /** Self-heal a missing vendor id from GET /v1/users/me (port of VendorGate). */
    public function ensureVendorId(): int
    {
        $vendor = $this->vendorId();
        if ($vendor > 0) {
            return $vendor;
        }
        $token = $this->token();
        if ($token === '') {
            throw new MarketplaceException(__('marketplace.basalam_vendor_missing'), 422);
        }
        try {
            $response = Http::timeout(20)->withToken($token)->acceptJson()->withHeaders(['User-Agent' => 'Webino-Basalam'])->get(BasalamEndpoints::USERS_ME);
        } catch (Throwable) {
            throw new MarketplaceException(__('marketplace.basalam_vendor_missing'), 422);
        }
        $data = (array) $response->json();
        $resolved = (int) (data_get($data, 'vendor.id') ?? data_get($data, 'data.vendor.id') ?? data_get($data, 'data.vendor_id') ?? data_get($data, 'vendor_id') ?? 0);
        if (! $response->successful() || $resolved < 1) {
            throw new MarketplaceException(__('marketplace.basalam_vendor_missing'), 422);
        }
        $this->settings->patchCredentials($this->tenantId, self::PLATFORM, ['vendor_id' => (string) $resolved]);
        $this->settings->putState($this->tenantId, self::PLATFORM, ['is_vendor' => true]);
        MarketplaceLogger::info($this->tenantId, self::PLATFORM, 'auth', 'vendor_id resolved from /users/me', ['vendor_id' => $resolved]);

        return $resolved;
    }

    public function markAuthError(string $message): void
    {
        $this->settings->putState($this->tenantId, self::PLATFORM, [
            'auth_error' => mb_substr($message, 0, 500),
            'auth_error_at' => now()->toIso8601String(),
        ]);
        MarketplaceLogger::error($this->tenantId, self::PLATFORM, 'auth', 'Basalam authorization failed: '.$message);
    }

    public function clearAuthError(): void
    {
        if (! empty($this->state()['auth_error'])) {
            $this->settings->putState($this->tenantId, self::PLATFORM, ['auth_error' => null, 'auth_error_at' => null]);
        }
    }
}
