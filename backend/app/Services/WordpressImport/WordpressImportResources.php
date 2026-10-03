<?php

namespace App\Services\WordpressImport;

use InvalidArgumentException;

final class WordpressImportResources
{
    /** Processing order. Parents and customers land before the records that reference them. */
    public const SCHEMA = 'webino.wordpress.import.v1';

    /** @var list<string> */
    public const SCHEMAS = [
        self::SCHEMA,
    ];

    public const ALL = [
        'media',
        'categories',
        'tags',
        'blog_categories',
        'blog_tags',
        'brands',
        'attribute_groups',
        'customers',
        'staff',
        'products',
        'coupons',
        'pages',
        'posts',
        'elementor_templates',
        'orders',
        'reviews',
        'menus',
        'redirects',
        'permalinks',
        'settings',
        'waiting_list',
        'tickets',
        'returns',
        'wallet',
        'review_queue',
        'stats',
    ];

    /**
     * Plugin names that mean a canonical resource.
     * `users` stays `customers` so existing batches do not become staff accounts.
     *
     * @var array<string, string>
     */
    public const ALIASES = [
        'woo_products' => 'products',
        'product_categories' => 'categories',
        'product_tags' => 'tags',
        'product_brands' => 'brands',
        'users' => 'customers',
        'staff_users' => 'staff',
        'attachments' => 'media',
        'media_non_image' => 'media',
        'media_files' => 'media',
        'analytics' => 'stats',
        'post_tags' => 'blog_tags',
        'blog_category' => 'blog_categories',
        'shop_coupon' => 'coupons',
        'comments' => 'reviews',
        'product_reviews' => 'reviews',
        'seo_redirects' => 'redirects',
        'elementor' => 'elementor_templates',
        'theme_builder' => 'elementor_templates',
        'swatches' => 'attribute_groups',
        'yith_waitlist' => 'waiting_list',
        'yith_waiting_list' => 'waiting_list',
        'permalink' => 'permalinks',
        'review-queue' => 'review_queue',
    ];

    public static function canonical(string $resource): string
    {
        $resource = strtolower(trim($resource));
        $resource = self::ALIASES[$resource] ?? $resource;
        if ($resource === '' || strlen($resource) > 32 || ! preg_match('/^[a-z0-9_]+$/', $resource)) {
            throw new InvalidArgumentException('Unknown import resource.');
        }

        return $resource;
    }

    /** @return list<string> */
    public static function advertised(): array
    {
        return array_merge(['woo_products'], self::ALL);
    }
}
