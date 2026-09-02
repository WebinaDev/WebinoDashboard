<?php

namespace App\Kernel;

final class ThemeCatalog
{
    public const ACCENTS = ['zinc', 'slate', 'blue', 'green', 'rose', 'orange'];

    public const FONTS = ['yekan-bakh', 'system'];

    /** @return array<string, mixed> */
    public static function defaultBranding(): array
    {
        return [
            'logo_url' => null,
            'logo_dark_url' => null,
            'favicon_url' => null,
            'accent' => 'zinc',
            'font' => 'yekan-bakh',
        ];
    }

    /** @return list<array<string, mixed>> */
    public static function all(): array
    {
        return [
            self::entry('ecommerce-starter', 'فروشگاه — استارتر', 'E-commerce starter', ['ecommerce'], false, 0),
            self::entry('ecommerce-default', 'فروشگاه — پیش‌فرض', 'E-commerce default', ['ecommerce'], false, 1),
            self::entry('ecommerce-demo-v1', 'فروشگاه — دمو ۱', 'E-commerce demo v1', ['ecommerce'], true, 2),
            self::entry('magazine-default', 'مجله — پیش‌فرض', 'Magazine default', ['magazine'], false, 1),
            self::entry('magazine-demo-v1', 'مجله — دمو ۱', 'Magazine demo v1', ['magazine'], true, 2),
            self::entry('cafe-starter', 'کافه — استارتر', 'Cafe starter', ['cafe'], false, 0),
            self::entry('cafe-default', 'کافه — پیش‌فرض', 'Cafe default', ['cafe'], false, 1),
            self::entry('cafe-demo-v1', 'کافه — دمو ۱', 'Cafe demo v1', ['cafe'], true, 2),
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

        return [
            'logo_url' => filled($branding['logo_url'] ?? null) ? (string) $branding['logo_url'] : null,
            'logo_dark_url' => filled($branding['logo_dark_url'] ?? null) ? (string) $branding['logo_dark_url'] : null,
            'favicon_url' => filled($branding['favicon_url'] ?? null) ? (string) $branding['favicon_url'] : null,
            'accent' => in_array($accent, self::ACCENTS, true) ? $accent : $defaults['accent'],
            'font' => in_array($font, self::FONTS, true) ? $font : $defaults['font'],
        ];
    }
}
