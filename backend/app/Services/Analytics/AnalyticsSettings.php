<?php

namespace App\Services\Analytics;

use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Str;

final class AnalyticsSettings
{
    public const MODULE = 'settings';

    public const KEY = 'site.analytics';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'tracking_enabled' => true,
            'anonymize_ip' => true,
            'exclude_roles' => ['admin'],
            'exclude_ips' => '',
            'exclude_urls' => "/dashboard\n/login\n/setup",
            'online_timeout' => 5,
            'retention_days' => 90,
            'record_logged_in' => false,
            'hit_token' => '',
            'daily_salt' => '',
            'daily_salt_date' => '',
            // Legacy GA/GTM keys kept so old payloads merge cleanly.
            'enabled' => true,
            'provider' => 'native',
            'ga_measurement_id' => '',
            'gtm_id' => '',
            'clarity_id' => '',
            'track_admin' => false,
        ];
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY);
        $merged = array_merge(self::defaults(), is_array($stored) ? $stored : []);
        $dirty = false;
        if ($merged['hit_token'] === '') {
            $merged['hit_token'] = Str::random(32);
            $dirty = true;
        }
        $today = gmdate('Y-m-d');
        if (($merged['daily_salt_date'] ?? '') !== $today || $merged['daily_salt'] === '') {
            $merged['daily_salt'] = Str::random(16);
            $merged['daily_salt_date'] = $today;
            $dirty = true;
        }
        if ($dirty) {
            app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $merged);
        }
        // Bridge legacy "enabled" flag into tracking_enabled.
        if (array_key_exists('enabled', $stored) && ! array_key_exists('tracking_enabled', $stored)) {
            $merged['tracking_enabled'] = (bool) $stored['enabled'];
        }

        return $merged;
    }

    /** Public settings without secrets. */
    /** @return array<string, mixed> */
    public static function public(int $tenantId): array
    {
        $s = self::get($tenantId);
        unset($s['hit_token'], $s['daily_salt'], $s['daily_salt_date']);

        return $s;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function save(int $tenantId, array $input): array
    {
        $current = self::get($tenantId);
        $clean = self::sanitize($input);
        $next = array_merge($current, $clean);
        // Preserve secrets unless explicitly rotated.
        $next['hit_token'] = $current['hit_token'];
        $next['daily_salt'] = $current['daily_salt'];
        $next['daily_salt_date'] = $current['daily_salt_date'];
        $next['enabled'] = (bool) $next['tracking_enabled'];
        $next['provider'] = 'native';
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $next);

        return self::public($tenantId);
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public static function sanitize(array $raw): array
    {
        $out = [];
        foreach (['tracking_enabled', 'anonymize_ip', 'record_logged_in', 'track_admin'] as $k) {
            if (array_key_exists($k, $raw)) {
                $out[$k] = filter_var($raw[$k], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false;
            }
        }
        if (array_key_exists('enabled', $raw) && ! array_key_exists('tracking_enabled', $raw)) {
            $out['tracking_enabled'] = filter_var($raw['enabled'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false;
        }
        if (isset($raw['online_timeout'])) {
            $out['online_timeout'] = max(1, min(60, (int) $raw['online_timeout']));
        }
        if (isset($raw['retention_days'])) {
            $out['retention_days'] = max(7, min(730, (int) $raw['retention_days']));
        }
        foreach (['exclude_ips', 'exclude_urls'] as $k) {
            if (array_key_exists($k, $raw) && is_scalar($raw[$k])) {
                $out[$k] = (string) $raw[$k];
            }
        }
        if (isset($raw['exclude_roles']) && is_array($raw['exclude_roles'])) {
            $allowed = self::editableRoles();
            $out['exclude_roles'] = array_values(array_unique(array_filter(
                array_map(fn ($r) => is_scalar($r) ? strtolower(trim((string) $r)) : '', $raw['exclude_roles']),
                fn (string $r) => $r !== '' && in_array($r, $allowed, true)
            )));
        }

        return $out;
    }

    /** @return list<string> */
    public static function editableRoles(): array
    {
        return array_values(array_map(
            fn ($r) => strtolower((string) $r),
            (array) config('capabilities.roles', [])
        ));
    }

    public static function trackingEnabled(int $tenantId): bool
    {
        $s = self::get($tenantId);

        return ! empty($s['tracking_enabled']);
    }
}
