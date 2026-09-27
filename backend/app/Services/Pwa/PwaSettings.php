<?php

namespace App\Services\Pwa;

use App\Kernel\ThemeCatalog;
use App\Models\Tenant;

final class PwaSettings
{
    public const KEY = 'site.pwa';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'enabled' => true,
            'name' => '',
            'short_name' => '',
            'description' => '',
            'theme_color' => '#0f172a',
            'background_color' => '#ffffff',
            'display' => 'standalone',
            'orientation' => 'any',
            'icon_source' => 'site',
            'icon_url' => '',
            'show_install_banner' => true,
            'splash_enabled' => true,
        ];
    }

    /** @return array<string, mixed> */
    public static function forTenant(int $tenantId, ?string $locale = null): array
    {
        $tenant = Tenant::query()->findOrFail($tenantId);
        $branding = is_array($tenant->branding) ? $tenant->branding : [];
        $stored = is_array($branding['pwa'] ?? null) ? $branding['pwa'] : [];
        $merged = self::sanitize(array_merge(self::defaults(), $stored));

        return array_merge($merged, self::resolved($tenant, $merged, $locale));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function save(int $tenantId, array $payload, ?string $locale = null): array
    {
        $tenant = Tenant::query()->findOrFail($tenantId);
        $branding = is_array($tenant->branding) ? $tenant->branding : [];
        $current = is_array($branding['pwa'] ?? null) ? $branding['pwa'] : [];
        $merged = self::sanitize(array_merge(self::defaults(), $current, $payload));
        $branding['pwa'] = $merged;
        $tenant->branding = $branding;
        $tenant->save();

        return array_merge($merged, self::resolved($tenant->fresh(), $merged, $locale));
    }

    /** @param  array<string, mixed>  $input */
    public static function sanitize(array $input): array
    {
        $defaults = self::defaults();
        $displayOk = ['standalone', 'fullscreen', 'minimal-ui'];
        $orientOk = ['any', 'portrait', 'landscape'];
        $iconOk = ['site', 'custom'];

        $display = strtolower((string) ($input['display'] ?? $defaults['display']));
        if (! in_array($display, $displayOk, true)) {
            $display = $defaults['display'];
        }
        $orientation = strtolower((string) ($input['orientation'] ?? $defaults['orientation']));
        if (! in_array($orientation, $orientOk, true)) {
            $orientation = $defaults['orientation'];
        }
        $iconSource = strtolower((string) ($input['icon_source'] ?? $defaults['icon_source']));
        if (! in_array($iconSource, $iconOk, true)) {
            $iconSource = $defaults['icon_source'];
        }

        $iconUrl = trim((string) ($input['icon_url'] ?? ''));
        if ($iconSource === 'custom' && $iconUrl === '') {
            $iconSource = 'site';
        }

        return [
            'enabled' => ! empty($input['enabled']),
            'name' => self::plainText((string) ($input['name'] ?? '')),
            'short_name' => self::plainText((string) ($input['short_name'] ?? '')),
            'description' => self::plainText((string) ($input['description'] ?? '')),
            'theme_color' => self::hexColor((string) ($input['theme_color'] ?? ''), $defaults['theme_color']),
            'background_color' => self::hexColor((string) ($input['background_color'] ?? ''), $defaults['background_color']),
            'display' => $display,
            'orientation' => $orientation,
            'icon_source' => $iconSource,
            'icon_url' => $iconUrl,
            'show_install_banner' => ! array_key_exists('show_install_banner', $input) ? true : ! empty($input['show_install_banner']),
            'splash_enabled' => ! array_key_exists('splash_enabled', $input) ? true : ! empty($input['splash_enabled']),
        ];
    }

    /** @param  array<string, mixed>  $settings */
    public static function clientBootstrap(Tenant $tenant, array $settings, ?string $locale = null): array
    {
        $resolved = self::resolved($tenant, $settings, $locale);

        return [
            'enabled' => ! empty($settings['enabled']),
            'showInstallBanner' => ! empty($settings['enabled']) && ! empty($settings['show_install_banner']),
            'splashEnabled' => ! empty($settings['enabled']) && ! empty($settings['splash_enabled']),
            'name' => $resolved['resolved_name'],
            'shortName' => $resolved['resolved_short_name'],
            'themeColor' => $settings['theme_color'],
            'backgroundColor' => $settings['background_color'],
            'iconUrl' => $resolved['icon_url'],
        ];
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    public static function manifestBody(Tenant $tenant, array $settings, string $startUrl, string $locale): array
    {
        $resolved = self::resolved($tenant, $settings, $locale);
        $localeTag = str_replace('_', '-', $locale !== '' ? $locale : 'en');
        $isRtl = str_starts_with(strtolower($localeTag), 'fa');

        $icons = [
            [
                'src' => $resolved['icon_url'],
                'sizes' => '192x192',
                'type' => 'image/png',
                'purpose' => 'any',
            ],
            [
                'src' => $resolved['icon_url'],
                'sizes' => '512x512',
                'type' => 'image/png',
                'purpose' => 'any',
            ],
            [
                'src' => $resolved['icon_url'],
                'sizes' => '192x192',
                'type' => 'image/png',
                'purpose' => 'maskable',
            ],
            [
                'src' => $resolved['icon_url'],
                'sizes' => '512x512',
                'type' => 'image/png',
                'purpose' => 'maskable',
            ],
        ];

        $body = [
            'id' => $startUrl,
            'name' => $resolved['resolved_name'],
            'short_name' => $resolved['resolved_short_name'],
            'description' => $resolved['resolved_description'],
            'start_url' => $startUrl,
            'scope' => $startUrl,
            'display' => (string) $settings['display'],
            'display_override' => [(string) $settings['display'], 'browser'],
            'background_color' => (string) $settings['background_color'],
            'theme_color' => (string) $settings['theme_color'],
            'lang' => $localeTag,
            'dir' => $isRtl ? 'rtl' : 'ltr',
            'icons' => $icons,
        ];

        if (($settings['orientation'] ?? 'any') !== 'any') {
            $body['orientation'] = (string) $settings['orientation'];
        }

        return $body;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    private static function resolved(Tenant $tenant, array $settings, ?string $locale = null): array
    {
        $locale = $locale ?? 'fa';
        $isFa = str_starts_with(strtolower($locale), 'fa');
        $branding = ThemeCatalog::normalizeBranding($tenant->branding);
        $siteName = (string) ($tenant->store_display_name ?? $tenant->name ?? '');

        $name = trim((string) ($settings['name'] ?? ''));
        if ($name === '') {
            if ($siteName !== '') {
                $name = $isFa ? 'داشبورد ('.$siteName.')' : 'Dashboard ('.$siteName.')';
            } else {
                $name = $isFa ? 'داشبورد' : 'Dashboard';
            }
        }

        $short = trim((string) ($settings['short_name'] ?? ''));
        if ($short === '') {
            $short = $isFa ? 'داشبورد' : 'Dashboard';
        }
        if (function_exists('mb_strlen') && mb_strlen($short) > 12) {
            $short = mb_substr($short, 0, 12);
        } elseif (strlen($short) > 12) {
            $short = substr($short, 0, 12);
        }

        $description = trim((string) ($settings['description'] ?? ''));
        if ($description === '') {
            $description = $isFa ? 'پیشخوان فروشگاه' : 'Store dashboard';
        }

        $siteIcon = (string) ($branding['favicon_url'] ?? '');
        $customIcon = trim((string) ($settings['icon_url'] ?? ''));
        $iconUrl = ($settings['icon_source'] ?? 'site') === 'custom' && $customIcon !== ''
            ? $customIcon
            : ($siteIcon !== '' ? $siteIcon : '/brand/logo.png');

        return [
            'resolved_name' => $name,
            'resolved_short_name' => $short,
            'resolved_description' => $description,
            'icon_url' => $iconUrl,
            'site_icon_url' => $siteIcon,
            'custom_icon_url' => $customIcon,
            'manifest_url' => '/manifest.webmanifest',
        ];
    }

    private static function plainText(string $value): string
    {
        return trim(strip_tags($value));
    }

    private static function hexColor(string $color, string $fallback): string
    {
        $color = trim($color);
        if (preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $color)) {
            return $color;
        }

        return $fallback;
    }
}
