<?php

namespace App\Kernel;

final class ModuleAliasMap
{
    /** @var array<string, array{0: string, 1: string}> */
    private const LEGACY = [
        'dashboard' => ['core', 'dashboard'],
        'media' => ['core', 'media'],
        'modules' => ['core', 'modules'],
        'catalog' => ['commerce', 'catalog'],
        'brands' => ['commerce', 'brands'],
        'attributes' => ['commerce', 'attributes'],
        'pricing' => ['commerce', 'pricing'],
        'marketplace' => ['commerce', 'marketplace'],
        'coffee_profile' => ['coffee-profile', 'profile'],
        'variants' => ['commerce', 'variants'],
        'orders' => ['commerce', 'orders'],
        'c2c' => ['commerce', 'c2c'],
        'wallet' => ['commerce', 'wallet'],
        'pos' => ['commerce', 'pos'],
        'cart' => ['commerce', 'cart'],
        'cafe_menu' => ['cafe', 'menu'],
        'cafe_hours' => ['cafe', 'hours'],
        'cafe_gallery' => ['cafe', 'gallery'],
        'cafe_venue' => ['cafe', 'venue'],
        'cafe_reservations' => ['cafe', 'reservations'],
        'cafe_qr' => ['cafe', 'qr'],
        'cafe_engagement' => ['cafe', 'engagement'],
        'cafe' => ['cafe', 'menu'],
        'checkout' => ['commerce', 'checkout'],
        'inventory' => ['commerce', 'inventory'],
        'analytics' => ['analytics', 'overview'],
        'rbac' => ['users', 'rbac'],
        'reports' => ['analytics', 'reports'],
        'marketing' => ['marketing', 'coupons'],
        'coupons' => ['marketing', 'coupons'],
        'bots_bale' => ['bots', 'bale'],
        'bots_telegram' => ['bots', 'telegram'],
        'sms' => ['sms-panel', 'panel'],
        'cms' => ['cms', 'pages'],
        'blog' => ['blog', 'posts'],
        'magazine' => ['magazine', 'articles'],
        'articles' => ['magazine', 'articles'],
        'resume' => ['resume', 'profile'],
        'profile' => ['resume', 'profile'],
        'academy' => ['academy', 'courses'],
        'portfolio' => ['corporate', 'portfolio'],
        'announcements' => ['corporate', 'announcements'],
        'testimonials' => ['corporate', 'testimonials'],
        'team' => ['corporate', 'team'],
        'consultations' => ['corporate', 'consultations'],
        'store_settings' => ['core', 'settings'],
        'native_api' => ['core', 'modules'],
        'ai_recommendations' => ['analytics', 'reports'],
        'accounting' => ['core', 'settings'],
    ];

    /** @return array{0: string, 1: string}|null */
    public static function resolve(string $legacySlug): ?array
    {
        return self::LEGACY[$legacySlug] ?? null;
    }
}
