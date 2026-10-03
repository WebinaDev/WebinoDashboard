<?php

namespace App\Services\Builder;

class ThemeTemplateKinds
{
    /** @var array<string, string> */
    public const KINDS = [
        'header' => 'هدرها',
        'footer' => 'فوترها',
        'single_post' => 'پست تکی',
        'single_page' => 'برگه تکی',
        'single_product' => 'محصول تکی',
        'archive' => 'بایگانی‌ها',
        'search' => 'نتایج جستجو',
        'product_archive' => 'آرشیو محصولات',
        'loop_item' => 'آیتم‌های لوپ',
        'not_found' => 'صفحه ۴۰۴',
    ];

    public const RULE_TYPES = 'entire_site,url,url_prefix,url_contains,singular,archive,search,not_found';

    public static function is(string $kind): bool
    {
        return array_key_exists($kind, self::KINDS);
    }

    /** @return array<string, mixed> */
    public static function conditionRules(): array
    {
        return [
            'conditions' => 'nullable|array',
            'conditions.include' => 'nullable|array|max:20',
            'conditions.include.*.type' => 'required|string|in:'.self::RULE_TYPES,
            'conditions.include.*.value' => 'nullable|string|max:255',
            'conditions.exclude' => 'nullable|array|max:20',
            'conditions.exclude.*.type' => 'required|string|in:'.self::RULE_TYPES,
            'conditions.exclude.*.value' => 'nullable|string|max:255',
        ];
    }
}
