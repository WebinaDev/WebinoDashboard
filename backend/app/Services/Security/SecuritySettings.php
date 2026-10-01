<?php

namespace App\Services\Security;

use App\Services\Modules\ModuleSettingsService;

/**
 * Tenant security settings (login lockout, WAF, headers, 2FA enforcement).
 * Stored under settings / site.security and actually enforced by middleware + AuthController.
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

        return $merged;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function save(int $tenantId, array $input): array
    {
        $current = self::get($tenantId);
        $merged = array_replace_recursive($current, $input);
        $clean = self::sanitize($merged);
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $clean);

        return $clean;
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
        ];
    }

    public static function isMasterEnabled(int $tenantId): bool
    {
        $s = self::get($tenantId);

        return ! empty($s['general']['enabled']);
    }
}
