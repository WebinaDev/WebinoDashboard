<?php

namespace App\Kernel;

final class SiteTypeProfiles
{
    public const TYPES = ['ecommerce', 'magazine', 'cafe', 'resume', 'corporate'];

    /** @return array<string, array{name_fa: string, name_en: string, theme: string, modules: array<string, list<string>>}> */
    public static function all(): array
    {
        return [
            'ecommerce' => [
                'name_fa' => 'فروشگاه اینترنتی',
                'name_en' => 'E-commerce',
                'theme' => 'ecommerce-starter',
                'modules' => array_merge(self::coreModules(), [
                    'commerce' => ['catalog', 'brands', 'attributes', 'variants', 'pricing', 'marketplace', 'cart', 'checkout', 'orders', 'c2c', 'wallet', 'pos', 'inventory'],
                    'coffee-profile' => ['profile'],
                    'users' => ['customers', 'staff', 'rbac'],
                    'cms' => ['pages', 'menus', 'seo'],
                    'blog' => ['posts', 'categories'],
                    'marketing' => ['coupons', 'bot-broadcast', 'bot-campaigns', 'sms', 'newsletter'],
                    'bots' => ['bale', 'telegram'],
                    'sms-panel' => ['panel'],
                    'analytics' => ['overview', 'reports'],
                ]),
            ],
            'magazine' => [
                'name_fa' => 'مجله آموزشی',
                'name_en' => 'Educational Magazine',
                'theme' => 'magazine-default',
                'modules' => array_merge(self::coreModules(), [
                    'magazine' => ['issues', 'articles', 'series', 'authors'],
                    'academy' => ['courses', 'lessons'],
                    'cms' => ['pages', 'menus', 'seo'],
                    'blog' => ['posts', 'categories'],
                    'users' => ['subscribers', 'rbac'],
                    'marketing' => ['newsletter'],
                    'analytics' => ['overview', 'reports'],
                ]),
            ],
            'cafe' => [
                'name_fa' => 'کافه و رستوران',
                'name_en' => 'Cafe & Restaurant',
                'theme' => 'cafe-starter',
                'modules' => array_merge(self::coreModules(), [
                    'cafe' => ['menu', 'reservations', 'hours', 'gallery', 'venue', 'qr', 'engagement'],
                    'commerce' => ['catalog', 'brands', 'attributes', 'variants', 'pricing', 'cart', 'checkout', 'orders', 'pos'],
                    'cms' => ['pages', 'menus', 'seo'],
                    'marketing' => ['coupons', 'bot-broadcast', 'bot-campaigns', 'sms'],
                    'bots' => ['bale', 'telegram'],
                    'sms-panel' => ['panel'],
                    'blog' => ['posts', 'categories'],
                    'analytics' => ['overview', 'reports'],
                ]),
            ],
            'resume' => [
                'name_fa' => 'رزومه',
                'name_en' => 'Resume',
                'theme' => 'resume-default',
                'modules' => array_merge(self::coreModules(), [
                    'resume' => ['profile', 'experience', 'education', 'skills', 'projects', 'contact'],
                    'cms' => ['pages', 'menus', 'seo'],
                ]),
            ],
            'corporate' => [
                'name_fa' => 'شرکتی',
                'name_en' => 'Corporate',
                'theme' => 'corporate-default',
                'modules' => array_merge(self::coreModules(), [
                    'corporate' => ['portfolio', 'team', 'testimonials', 'announcements', 'consultations'],
                    'academy' => ['courses', 'lessons'],
                    'cms' => ['pages', 'menus', 'seo'],
                    'blog' => ['posts', 'categories'],
                    'users' => ['rbac'],
                    'marketing' => ['coupons', 'bot-broadcast', 'bot-campaigns', 'sms'],
                    'bots' => ['bale', 'telegram'],
                    'sms-panel' => ['panel'],
                    'analytics' => ['overview', 'reports'],
                ]),
            ],
        ];
    }

    /** @return array<string, list<string>> */
    public static function coreModules(): array
    {
        return [
            'core' => ['auth', 'setup', 'tenant', 'dashboard', 'settings', 'media', 'i18n', 'modules', 'themes'],
        ];
    }

    /** @return list<string> */
    public static function coreSubmoduleKeys(): array
    {
        $keys = [];
        foreach (self::coreModules() as $module => $subs) {
            foreach ($subs as $sub) {
                $keys[] = "{$module}.{$sub}";
            }
        }

        return $keys;
    }

    public static function isValid(string $slug): bool
    {
        return in_array($slug, self::TYPES, true);
    }

    /** @return array<string, list<string>>|null */
    public static function modulesFor(string $siteType): ?array
    {
        return self::all()[$siteType]['modules'] ?? null;
    }
}
