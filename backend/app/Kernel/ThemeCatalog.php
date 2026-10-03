<?php

namespace App\Kernel;

final class ThemeCatalog
{
    public const ACCENTS = ['zinc', 'slate', 'blue', 'green', 'rose', 'orange'];

    public const FONTS = ['yekan-bakh', 'system', 'vazirmatn', 'iran-sans'];

    /** @var list<string> */
    public const PALETTE_KEYS = ['primary', 'secondary', 'accent', 'bg', 'surface', 'text', 'muted'];

    /** @var list<string> */
    public const GEO_NOTICE_COLOR_KEYS = [
        'bg', 'border', 'text', 'icon', 'button_bg', 'button_text',
    ];

    /** @return array<string, mixed> */
    public static function defaultBranding(): array
    {
        return [
            'logo_url' => null,
            'logo_dark_url' => null,
            'favicon_url' => null,
            'logo_id' => null,
            'logo_dark_id' => null,
            'favicon_id' => null,
            'accent' => 'zinc',
            'font' => 'yekan-bakh',
            'font_body' => 'yekan-bakh',
            'font_heading' => 'yekan-bakh',
            'font_ui' => 'yekan-bakh',
            'palette' => self::defaultPalette(),
            'geo_notice_colors' => self::defaultGeoNoticeColors(),
            'wfcp_colors' => [],
        ];
    }

    /** @return array<string, string> */
    public static function defaultPalette(): array
    {
        return [
            'primary' => '#0f172a',
            'secondary' => '#334155',
            'accent' => '#e775ae',
            'bg' => '#ffffff',
            'surface' => '#f8fafc',
            'text' => '#0f172a',
            'muted' => '#64748b',
        ];
    }

    /** @return array<string, string> */
    public static function defaultGeoNoticeColors(): array
    {
        return [
            'bg' => '#fff7ed',
            'border' => '#fdba74',
            'text' => '#9a3412',
            'icon' => '#ea580c',
            'button_bg' => '#ea580c',
            'button_text' => '#ffffff',
        ];
    }

    /** @return list<array<string, mixed>> */
    public static function all(): array
    {
        return [
            self::entry('ecommerce-starter', 'فروشگاه — استارتر', 'E-commerce starter', ['ecommerce'], false, 0),
            self::entry('ecommerce-default', 'فروشگاه — پیش‌فرض', 'E-commerce default', ['ecommerce'], false, 1),
            self::entry('ecommerce-demo-v1', 'فروشگاه — دمو ۱', 'E-commerce demo v1', ['ecommerce'], true, 2),
            self::entry('ecommerce-ishop', 'فروشگاه — آی‌شاپ', 'E-commerce ishop', ['ecommerce'], false, 3),
            self::entry('magazine-default', 'مجله — پیش‌فرض', 'Magazine default', ['magazine'], false, 1),
            self::entry('magazine-demo-v1', 'مجله — دمو ۱', 'Magazine demo v1', ['magazine'], true, 2),
            self::entry('cafe-starter', 'کافه — استارتر', 'Cafe starter', ['cafe'], false, 0),
            self::entry('cafe-default', 'کافه — پیش‌فرض', 'Cafe default', ['cafe'], false, 1),
            self::entry('cafe-demo-v1', 'کافه — دمو ۱', 'Cafe demo v1', ['cafe'], true, 2),
            self::entry('cafe-reyhoon', 'کافه ریحون', 'Cafe Reyhoon', ['cafe'], false, 3),
            self::entry('cafe-mash-donald', 'فست‌فود مَش‌دانالد', 'Mash Donald', ['cafe'], true, 4),
            self::entry('cafe-kerase', 'کافه کِراسِه', 'Cafe Kerase', ['cafe'], true, 5),
            self::entry('cafe-super', 'سوپر پریمیوم', 'Super premium', ['cafe'], true, 6),
            self::entry('cafe-menew', 'منیو برند', 'MeNew brand', ['cafe'], true, 7),
            self::entry('resume-default', 'رزومه — پیش‌فرض', 'Resume default', ['resume'], false, 1),
            self::entry('resume-demo-v1', 'رزومه — دمو ۱', 'Resume demo v1', ['resume'], true, 2),
            self::entry('corporate-default', 'شرکتی — پیش‌فرض', 'Corporate default', ['corporate'], false, 1),
            self::entry('corporate-demo-v1', 'شرکتی — دمو ۱', 'Corporate demo v1', ['corporate'], true, 2),
        ];
    }

    /**
     * @param  list<string>  $siteTypes
     * @return array<string, mixed>
     */
    private static function entry(
        string $slug,
        string $nameFa,
        string $nameEn,
        array $siteTypes,
        bool $isDemo,
        int $sortOrder,
    ): array {
        return [
            'slug' => $slug,
            'name_fa' => $nameFa,
            'name_en' => $nameEn,
            'site_types' => $siteTypes,
            'is_demo' => $isDemo,
            'preview' => '/themes/'.$slug.'/preview.svg',
            'sort_order' => $sortOrder,
        ];
    }

    /** @return list<array<string, mixed>> */
    public static function forSiteType(?string $siteTypeSlug): array
    {
        if (! is_string($siteTypeSlug) || $siteTypeSlug === '') {
            return self::all();
        }

        return array_values(array_filter(
            self::all(),
            fn (array $theme) => in_array($siteTypeSlug, $theme['site_types'], true)
        ));
    }

    /** @return array<string, mixed>|null */
    public static function find(string $slug): ?array
    {
        foreach (self::all() as $theme) {
            if ($theme['slug'] === $slug) {
                return $theme;
            }
        }

        return null;
    }

    public static function isAllowedForSiteType(string $slug, ?string $siteTypeSlug): bool
    {
        $theme = self::find($slug);
        if ($theme === null) {
            return false;
        }

        if (! is_string($siteTypeSlug) || $siteTypeSlug === '') {
            return true;
        }

        return in_array($siteTypeSlug, $theme['site_types'], true);
    }

    /** @param  array<string, mixed>|null  $branding */
    public static function normalizeBranding(?array $branding): array
    {
        $defaults = self::defaultBranding();
        if (! is_array($branding)) {
            return $defaults;
        }

        $accent = $branding['accent'] ?? $defaults['accent'];
        $font = $branding['font'] ?? $defaults['font'];
        $fontBody = $branding['font_body'] ?? $font;
        $fontHeading = $branding['font_heading'] ?? $font;
        $fontUi = $branding['font_ui'] ?? $font;

        $palette = self::defaultPalette();
        if (is_array($branding['palette'] ?? null)) {
            foreach (self::PALETTE_KEYS as $key) {
                $hex = self::hexOrNull($branding['palette'][$key] ?? null);
                if ($hex) {
                    $palette[$key] = $hex;
                }
            }
        }

        $geo = self::defaultGeoNoticeColors();
        if (is_array($branding['geo_notice_colors'] ?? null)) {
            foreach (self::GEO_NOTICE_COLOR_KEYS as $key) {
                $hex = self::hexOrNull($branding['geo_notice_colors'][$key] ?? null);
                if ($hex) {
                    $geo[$key] = $hex;
                }
            }
        }

        $wfcp = [];
        if (is_array($branding['wfcp_colors'] ?? null)) {
            foreach ($branding['wfcp_colors'] as $k => $v) {
                $hex = self::hexOrNull($v);
                if ($hex && is_string($k)) {
                    $wfcp[mb_substr($k, 0, 64)] = $hex;
                }
            }
        }

        return [
            'logo_url' => filled($branding['logo_url'] ?? null) ? (string) $branding['logo_url'] : null,
            'logo_dark_url' => filled($branding['logo_dark_url'] ?? null) ? (string) $branding['logo_dark_url'] : null,
            'favicon_url' => filled($branding['favicon_url'] ?? null) ? (string) $branding['favicon_url'] : null,
            'logo_id' => self::nullableId($branding['logo_id'] ?? null),
            'logo_dark_id' => self::nullableId($branding['logo_dark_id'] ?? null),
            'favicon_id' => self::nullableId($branding['favicon_id'] ?? null),
            'accent' => in_array($accent, self::ACCENTS, true) ? $accent : $defaults['accent'],
            'font' => in_array($font, self::FONTS, true) ? $font : $defaults['font'],
            'font_body' => in_array($fontBody, self::FONTS, true) ? $fontBody : $defaults['font_body'],
            'font_heading' => in_array($fontHeading, self::FONTS, true) ? $fontHeading : $defaults['font_heading'],
            'font_ui' => in_array($fontUi, self::FONTS, true) ? $fontUi : $defaults['font_ui'],
            'palette' => $palette,
            'geo_notice_colors' => $geo,
            'wfcp_colors' => $wfcp,
        ];
    }

    /**
     * Merge normalized branding fields into existing tenant branding without dropping nested blobs (e.g. pwa).
     *
     * @param  array<string, mixed>|null  $existing
     * @param  array<string, mixed>  $normalized
     * @return array<string, mixed>
     */
    public static function mergeIntoExisting(?array $existing, array $normalized): array
    {
        $base = is_array($existing) ? $existing : [];
        foreach ($normalized as $key => $value) {
            $base[$key] = $value;
        }

        return $base;
    }

    private static function hexOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $v = trim($value);
        if (preg_match('/^#?[0-9a-fA-F]{6}$/', $v)) {
            return str_starts_with($v, '#') ? strtolower($v) : '#'.strtolower($v);
        }
        if (preg_match('/^#?[0-9a-fA-F]{3}$/', $v)) {
            $v = ltrim($v, '#');

            return '#'.$v[0].$v[0].$v[1].$v[1].$v[2].$v[2];
        }

        return null;
    }

    private static function nullableId(mixed $value): ?int
    {
        if ($value === null || $value === '' || $value === false) {
            return null;
        }
        $n = (int) $value;

        return $n > 0 ? $n : null;
    }
}
