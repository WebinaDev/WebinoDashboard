<?php

namespace App\Services\LinkHub;

/**
 * Whitelists link-hub theme_json. Unknown keys are dropped, invalid values fall back
 * to defaults, and legacy rows ({accent, background}) keep working unchanged.
 */
final class LinkHubTheme
{
    public const MODES = ['light', 'dark'];

    public const FONTS = ['yekan-bakh', 'system'];

    public const GRADIENTS = ['none', 'accent', 'aurora', 'ocean', 'sunset', 'night'];

    public const CARD_STYLES = ['soft', 'outline', 'glass', 'solid'];

    /** @return array<string, mixed> */
    public static function normalize(mixed $raw): array
    {
        $raw = is_array($raw) ? $raw : [];
        $out = [];

        foreach (['accent', 'background'] as $key) {
            $color = self::color($raw[$key] ?? null);
            if ($color !== null) {
                $out[$key] = $color;
            }
        }

        $out['mode'] = self::pick($raw['mode'] ?? null, self::MODES, 'light');
        $out['font'] = self::pick($raw['font'] ?? null, self::FONTS, 'yekan-bakh');
        $out['hero_gradient'] = self::pick($raw['hero_gradient'] ?? null, self::GRADIENTS, 'accent');
        $out['card_style'] = self::pick($raw['card_style'] ?? null, self::CARD_STYLES, 'soft');
        $radius = is_numeric($raw['radius'] ?? null) ? (int) $raw['radius'] : 18;
        $out['radius'] = max(0, min(32, $radius));

        foreach (['kicker' => 120, 'headline' => 160, 'headline_accent' => 80, 'footer_note' => 240] as $key => $max) {
            $value = trim((string) ($raw[$key] ?? ''));
            if ($value !== '') {
                $out[$key] = mb_substr(strip_tags($value), 0, $max);
            }
        }

        return $out;
    }

    public static function color(mixed $value): ?string
    {
        $value = is_string($value) ? trim($value) : '';

        return preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $value) ? strtolower($value) : null;
    }

    /** Allow web, phone, mail, sms and site-relative links; drop script and data URLs. */
    public static function safeUrl(mixed $value): ?string
    {
        $url = is_string($value) ? trim($value) : '';
        if ($url === '' || $url === '#') {
            return null;
        }
        if (str_starts_with($url, '/') && ! str_starts_with($url, '//')) {
            return $url;
        }
        // parse_url() reads "tel:0211" as host:port, so match the scheme directly.
        $scheme = preg_match('/^([a-z][a-z0-9+.-]*):/i', $url, $m) ? strtolower($m[1]) : '';

        return in_array($scheme, ['http', 'https', 'tel', 'mailto', 'sms'], true) ? $url : null;
    }

    /** Images must be http(s) or site-relative. */
    public static function safeImage(mixed $value): ?string
    {
        $url = self::safeUrl($value);
        if ($url === null) {
            return null;
        }

        return str_starts_with($url, '/') || preg_match('#^https?://#i', $url) ? $url : null;
    }

    /** @param  list<string>  $allowed */
    private static function pick(mixed $value, array $allowed, string $default): string
    {
        return is_string($value) && in_array($value, $allowed, true) ? $value : $default;
    }
}
