<?php

namespace App\Services\Integrations;

use App\Services\Modules\ModuleSettingsService;

/**
 * Per-tenant Instagram Graph API credentials for the live feed widget.
 * Token is a long-lived Instagram User access token for a Business/Creator account;
 * never commit tokens. Stored in module_settings (settings / site.instagram).
 */
final class InstagramSettings
{
    public const KEY = 'site.instagram';

    public const SECRET_KEYS = ['access_token'];

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'enabled' => false,
            'access_token' => '',
            'ig_user_id' => '',
            'handle' => '',
            'cache_hours' => 3,
        ];
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId): array
    {
        /** @var ModuleSettingsService $settings */
        $settings = app(ModuleSettingsService::class);

        return self::sanitize(array_merge(
            self::defaults(),
            $settings->get($tenantId, 'settings', self::KEY, [])
        ));
    }

    /** @return array<string, mixed> */
    public static function public(int $tenantId): array
    {
        $s = self::get($tenantId);
        foreach (self::SECRET_KEYS as $k) {
            $raw = (string) ($s[$k] ?? '');
            $s[$k] = $raw === '' ? '' : self::mask($raw);
            $s[$k.'_set'] = $raw !== '';
        }

        return $s;
    }

    public static function mask(string $key): string
    {
        $len = mb_strlen($key);
        if ($len <= 8) {
            return str_repeat('*', max(4, $len));
        }

        return mb_substr($key, 0, 4).str_repeat('*', max(4, $len - 8)).mb_substr($key, -4);
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

        foreach (self::SECRET_KEYS as $k) {
            if (! array_key_exists($k, $input)) {
                continue;
            }
            $incoming = trim((string) $input[$k]);
            // Keep existing secret when the UI sends a masked placeholder or blank intentional clear via clear_token.
            if ($incoming === '' || str_contains($incoming, '*')) {
                if (! empty($input['clear_token'])) {
                    $next[$k] = '';
                } else {
                    $next[$k] = (string) ($current[$k] ?? '');
                }
            } else {
                $next[$k] = $incoming;
            }
        }

        unset($next['clear_token'], $next['access_token_set']);

        /** @var ModuleSettingsService $settings */
        $settings = app(ModuleSettingsService::class);
        $settings->put($tenantId, 'settings', self::KEY, self::sanitize($next));

        app(InstagramFeedService::class)->forgetCache($tenantId);

        return self::public($tenantId);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function sanitize(array $input): array
    {
        $defaults = self::defaults();
        $handle = ltrim(trim((string) ($input['handle'] ?? '')), '@');
        $handle = preg_replace('/[^A-Za-z0-9._]/', '', $handle ?? '') ?? '';
        $cache = (int) ($input['cache_hours'] ?? $defaults['cache_hours']);
        $cache = max(1, min(6, $cache));

        return [
            'enabled' => ! empty($input['enabled']),
            'access_token' => trim((string) ($input['access_token'] ?? '')),
            'ig_user_id' => preg_replace('/\D+/', '', (string) ($input['ig_user_id'] ?? '')) ?? '',
            'handle' => $handle,
            'cache_hours' => $cache,
        ];
    }

    public static function rawToken(int $tenantId): string
    {
        return (string) (self::get($tenantId)['access_token'] ?? '');
    }
}
