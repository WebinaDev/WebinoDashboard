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

    /** classic = original stacked page; spotlight = premium animated portrait layout; card = centered card with arch portrait and pulse line. */
    public const LAYOUTS = ['classic', 'spotlight', 'card'];

    public const LOCALES = ['fa', 'en'];

    /** Theme text fields that can carry an English translation under i18n.en. */
    public const TEXT_FIELDS = ['kicker' => 120, 'headline' => 160, 'headline_accent' => 80, 'footer_note' => 240];

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

        $out['layout'] = self::pick($raw['layout'] ?? null, self::LAYOUTS, 'classic');

        // Bilingual pages: fa/en with a site-chosen default. Single-locale pages omit both keys.
        $locales = array_values(array_intersect(self::LOCALES, is_array($raw['locales'] ?? null) ? $raw['locales'] : []));
        if (count($locales) > 1) {
            $out['locales'] = $locales;
            $out['default_locale'] = self::pick($raw['default_locale'] ?? null, $locales, $locales[0]);
            $en = is_array($raw['i18n']['en'] ?? null) ? $raw['i18n']['en'] : [];
            $tr = [];
            foreach (self::TEXT_FIELDS + ['title' => 120, 'bio' => 500] as $key => $max) {
                $value = self::text($en[$key] ?? null, $max);
                if ($value !== null) {
                    $tr[$key] = $value;
                }
            }
            if ($tr !== []) {
                $out['i18n'] = ['en' => $tr];
            }
        }

        // Headline stats ("12+ years") and skill tags, shown by the spotlight layout.
        $highlights = [];
        foreach (array_slice(is_array($raw['highlights'] ?? null) ? $raw['highlights'] : [], 0, 4) as $row) {
            if (! is_array($row) || self::text($row['value'] ?? null, 24) === null) {
                continue;
            }
            $highlights[] = array_filter([
                'value' => self::text($row['value'] ?? null, 24),
                'label' => self::text($row['label'] ?? null, 60),
                'value_en' => self::text($row['value_en'] ?? null, 24),
                'label_en' => self::text($row['label_en'] ?? null, 60),
            ], fn ($v) => $v !== null);
        }
        if ($highlights !== []) {
            $out['highlights'] = $highlights;
        }
        // tags = base (fa) list; tags_en = optional English list for bilingual pages.
        foreach (['tags', 'tags_en'] as $key) {
            $tags = [];
            foreach (array_slice(is_array($raw[$key] ?? null) ? $raw[$key] : [], 0, 16) as $tag) {
                $tag = self::text($tag, 32);
                if ($tag !== null) {
                    $tags[] = $tag;
                }
            }
            if ($tags !== []) {
                $out[$key] = $tags;
            }
        }

        return $out;
    }

    public static function text(mixed $value, int $max): ?string
    {
        $value = is_string($value) || is_numeric($value) ? trim(strip_tags((string) $value)) : '';

        return $value === '' ? null : mb_substr($value, 0, $max);
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
