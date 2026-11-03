<?php

namespace App\Services\Security;

use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Facades\Crypt;

/**
 * Tenant security settings (login lockout, WAF, headers, 2FA, captcha, SSL, edge).
 * Stored under settings / site.security and enforced by middleware + AuthController + forms.
 */
final class SecuritySettings
{
    public const MODULE = 'settings';

    public const KEY = 'site.security';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'general' => [
                'profile' => 'recommended',
                'enabled' => true,
                'wizard_completed' => false,
            ],
            'privacy' => [
                // Laravel equivalent of WP hide_wp_version: strip framework fingerprint headers.
                'hide_app_fingerprint' => true,
                'disable_dangerous_debug' => true,
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
                'x_content_type_options' => 'nosniff',
                'permissions_policy' => 'camera=(), microphone=(), geolocation=()',
            ],
            'notify' => [
                'email' => true,
                'site' => true,
            ],
            // Country block/allow list from edge header (Cloudflare/Arvan). Admin + webhooks are exempt.
            'geo' => [
                'enabled' => false,
                'mode' => 'block',
                'countries' => [],
                'header' => 'CF-IPCountry',
            ],
            // Per-tenant rate classes (requests / minute / IP).
            'rate' => [
                'checkout_per_min' => 10,
                'public_writes_per_min' => 30,
                'auth_per_min' => 5,
            ],
            'forensics' => [
                'log_events' => true,
                'retention_days' => 30,
            ],
            // HTTPS / HSTS (headers only; reverse proxy still terminates TLS).
            'ssl' => [
                'force_https' => false,
                'hsts' => false,
                'hsts_max_age' => 31536000,
                'hsts_include_subdomains' => false,
                'hsts_preload' => false,
            ],
            // Edge / CDN awareness (does not write Performance CDN settings).
            'edge' => [
                'hide_origin_ip' => false,
                'notes' => '',
            ],
            // Captcha providers (numeric works offline for Iranian hosts).
            'captcha' => [
                'provider' => 'none',
                'site_key' => '',
                'secret_key' => '',
                'v3_threshold' => 0.5,
                'protect' => [
                    'forms' => false,
                    'login' => false,
                    'checkout' => false,
                    'comments' => false,
                ],
            ],
            'spam' => [
                'honeypot' => true,
                'min_submit_ms' => 1500,
            ],
        ];
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY, []);
        $merged = array_replace_recursive(self::defaults(), is_array($stored) ? $stored : []);

        // Migrate legacy WP-shaped key.
        if (isset($merged['privacy']['hide_wp_version']) && ! isset($stored['privacy']['hide_app_fingerprint'])) {
            $merged['privacy']['hide_app_fingerprint'] = (bool) $merged['privacy']['hide_wp_version'];
        }
        unset($merged['privacy']['hide_wp_version'], $merged['privacy']['disable_file_edit']);

        $merged['captcha']['secret_key'] = self::maskSecret(self::decryptSecret((string) ($merged['captcha']['secret_key'] ?? '')));

        return $merged;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function save(int $tenantId, array $input): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY, []);
        $current = array_replace_recursive(self::defaults(), is_array($stored) ? $stored : []);
        $merged = array_replace_recursive($current, $input);

        // Preserve secret when client sends mask / empty.
        $incomingSecret = data_get($input, 'captcha.secret_key');
        if (! is_string($incomingSecret) || $incomingSecret === '' || str_contains($incomingSecret, '•') || str_contains($incomingSecret, '*')) {
            data_set($merged, 'captcha.secret_key', (string) data_get($current, 'captcha.secret_key', ''));
        } else {
            data_set($merged, 'captcha.secret_key', 'enc:'.Crypt::encryptString(trim($incomingSecret)));
        }

        $clean = self::sanitize($merged);
        // sanitize masks; re-apply encrypted secret for storage
        $clean['captcha']['secret_key'] = (string) data_get($merged, 'captcha.secret_key', '');
        if ($clean['captcha']['secret_key'] !== '' && ! str_starts_with($clean['captcha']['secret_key'], 'enc:')) {
            $clean['captcha']['secret_key'] = 'enc:'.Crypt::encryptString($clean['captcha']['secret_key']);
        }

        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $clean);

        return self::get($tenantId);
    }

    /** @param  array<string, mixed>  $input */
    public static function sanitize(array $input): array
    {
        $d = self::defaults();
        $profiles = ['beginner', 'recommended', 'store', 'paranoid'];
        $profile = (string) ($input['general']['profile'] ?? $d['general']['profile']);
        if (! in_array($profile, $profiles, true)) {
            $profile = $d['general']['profile'];
        }

        $xFrame = strtoupper(trim((string) ($input['headers']['x_frame_options'] ?? $d['headers']['x_frame_options'])));
        if (! in_array($xFrame, ['DENY', 'SAMEORIGIN', ''], true) && ! str_starts_with($xFrame, 'ALLOW-FROM')) {
            $xFrame = $d['headers']['x_frame_options'];
        }

        $referrer = trim((string) ($input['headers']['referrer_policy'] ?? $d['headers']['referrer_policy']));
        $allowedReferrers = [
            '', 'no-referrer', 'no-referrer-when-downgrade', 'origin', 'origin-when-cross-origin',
            'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url',
        ];
        if (! in_array($referrer, $allowedReferrers, true)) {
            $referrer = $d['headers']['referrer_policy'];
        }

        $provider = (string) ($input['captcha']['provider'] ?? $d['captcha']['provider']);
        if (! in_array($provider, CaptchaService::PROVIDERS, true)) {
            $provider = 'none';
        }

        $hstsMax = max(0, min(63072000, (int) ($input['ssl']['hsts_max_age'] ?? $d['ssl']['hsts_max_age'])));
        $threshold = (float) ($input['captcha']['v3_threshold'] ?? 0.5);
        $threshold = max(0.0, min(1.0, $threshold));

        return [
            'general' => [
                'profile' => $profile,
                'enabled' => ! empty($input['general']['enabled']),
                'wizard_completed' => ! empty($input['general']['wizard_completed']),
            ],
            'privacy' => [
                'hide_app_fingerprint' => ! empty($input['privacy']['hide_app_fingerprint']
                    ?? $input['privacy']['hide_wp_version'] ?? true),
                'disable_dangerous_debug' => ! empty($input['privacy']['disable_dangerous_debug']
                    ?? $input['privacy']['disable_file_edit'] ?? true),
            ],
            'login' => [
                'limit_attempts' => ! empty($input['login']['limit_attempts']),
                'max_attempts' => max(1, min(50, (int) ($input['login']['max_attempts'] ?? 5))),
                'lockout_minutes' => max(1, min(1440, (int) ($input['login']['lockout_minutes'] ?? 15))),
                'force_2fa_admins' => ! empty($input['login']['force_2fa_admins']),
            ],
            'waf' => [
                'enabled' => ! empty($input['waf']['enabled']),
                'enforce' => ! empty($input['waf']['enforce']),
            ],
            'headers' => [
                'x_frame_options' => $xFrame,
                'referrer_policy' => $referrer,
                'x_content_type_options' => (string) ($input['headers']['x_content_type_options']
                    ?? $d['headers']['x_content_type_options']),
                'permissions_policy' => mb_substr(
                    (string) ($input['headers']['permissions_policy'] ?? $d['headers']['permissions_policy']),
                    0,
                    512
                ),
            ],
            'notify' => [
                'email' => ! empty($input['notify']['email']),
                'site' => ! empty($input['notify']['site']),
            ],
            'geo' => [
                'enabled' => ! empty($input['geo']['enabled']),
                'mode' => ($input['geo']['mode'] ?? 'block') === 'allow' ? 'allow' : 'block',
                'countries' => array_values(array_unique(array_filter(array_map(
                    fn ($c) => strtoupper(trim((string) $c)),
                    is_array($input['geo']['countries'] ?? null) ? $input['geo']['countries'] : preg_split('/[\s,]+/', (string) ($input['geo']['countries'] ?? ''))
                ), fn ($c) => (bool) preg_match('/^[A-Z]{2}$/', $c)))),
                'header' => preg_match('/^[A-Za-z0-9-]{2,40}$/', (string) ($input['geo']['header'] ?? '')) ? (string) $input['geo']['header'] : 'CF-IPCountry',
            ],
            'rate' => [
                'checkout_per_min' => max(1, min(600, (int) ($input['rate']['checkout_per_min'] ?? 10))),
                'public_writes_per_min' => max(1, min(600, (int) ($input['rate']['public_writes_per_min'] ?? 30))),
                'auth_per_min' => max(1, min(60, (int) ($input['rate']['auth_per_min'] ?? 5))),
            ],
            'forensics' => [
                'log_events' => ! empty($input['forensics']['log_events']),
                'retention_days' => max(1, min(365, (int) ($input['forensics']['retention_days'] ?? 30))),
            ],
            'ssl' => [
                'force_https' => ! empty($input['ssl']['force_https']),
                'hsts' => ! empty($input['ssl']['hsts']),
                'hsts_max_age' => $hstsMax,
                'hsts_include_subdomains' => ! empty($input['ssl']['hsts_include_subdomains']),
                'hsts_preload' => ! empty($input['ssl']['hsts_preload']),
            ],
            'edge' => [
                'hide_origin_ip' => ! empty($input['edge']['hide_origin_ip']),
                'notes' => mb_substr(trim((string) ($input['edge']['notes'] ?? '')), 0, 2000),
            ],
            'captcha' => [
                'provider' => $provider,
                'site_key' => mb_substr(trim((string) ($input['captcha']['site_key'] ?? '')), 0, 200),
                'secret_key' => self::maskSecret(self::decryptSecret((string) ($input['captcha']['secret_key'] ?? ''))),
                'v3_threshold' => $threshold,
                'protect' => [
                    'forms' => ! empty($input['captcha']['protect']['forms']),
                    'login' => ! empty($input['captcha']['protect']['login']),
                    'checkout' => ! empty($input['captcha']['protect']['checkout']),
                    'comments' => ! empty($input['captcha']['protect']['comments']),
                ],
            ],
            'spam' => [
                'honeypot' => ! empty($input['spam']['honeypot'] ?? true),
                'min_submit_ms' => max(0, min(30000, (int) ($input['spam']['min_submit_ms'] ?? 1500))),
            ],
        ];
    }

    public static function isMasterEnabled(int $tenantId): bool
    {
        $s = self::get($tenantId);

        return ! empty($s['general']['enabled']);
    }

    private static function decryptSecret(string $value): string
    {
        if (str_starts_with($value, 'enc:')) {
            try {
                return Crypt::decryptString(substr($value, 4));
            } catch (\Throwable) {
                return '';
            }
        }

        return $value;
    }

    private static function maskSecret(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        if (strlen($value) <= 4) {
            return '••••';
        }

        return '••••'.substr($value, -4);
    }
}
