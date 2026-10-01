<?php

namespace App\Services\WordpressImport;

use InvalidArgumentException;

final class WordpressImportResources
{
    /** Processing order. Parents and customers land before the records that reference them. */
    public const ALL = [
        'media',
        'categories',
        'tags',
        'customers',
        'products',
        'pages',
        'posts',
        'orders',
        'menus',
        'stats',
    ];

    /** @var array<string, string> */
    public const ALIASES = [
        'woo_products' => 'products',
        'product_categories' => 'categories',
        'product_tags' => 'tags',
        'users' => 'customers',
        'attachments' => 'media',
        'analytics' => 'stats',
    ];

    public static function canonical(string $resource): string
    {
        $resource = strtolower(trim($resource));
        $resource = self::ALIASES[$resource] ?? $resource;
        if (! in_array($resource, self::ALL, true)) {
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
