<?php

namespace App\Services\Builder;

class ThemeRequestContext
{
    public function __construct(
        public readonly string $path = '/',
        public readonly ?string $singular = null,
        public readonly ?string $archive = null,
        public readonly bool $search = false,
        public readonly bool $notFound = false,
        /** Current product/post slug (singular pages). */
        public readonly ?string $slug = null,
        /** Current product category slug (category archive or the product's category); collection slug on collection items. */
        public readonly ?string $category = null,
    ) {}

    /** @param  array<string, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(
            self::normalizePath(isset($data['path']) ? (string) $data['path'] : '/'),
            self::enum($data['singular'] ?? null, ['post', 'page', 'product', 'collection_item']),
            self::enum($data['archive'] ?? null, ['blog', 'category', 'tag', 'product']),
            filter_var($data['search'] ?? false, FILTER_VALIDATE_BOOLEAN),
            filter_var($data['not_found'] ?? false, FILTER_VALIDATE_BOOLEAN),
            self::slug($data['slug'] ?? null),
            self::slug($data['category'] ?? null),
        );
    }

    public static function normalizePath(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            return '/';
        }
        $only = parse_url($path, PHP_URL_PATH);
        if (is_string($only) && $only !== '') {
            $path = $only;
        }
        if (! str_starts_with($path, '/')) {
            $path = '/'.$path;
        }
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/') ?: '/';
        }

        return $path;
    }

    private static function slug(mixed $value): ?string
    {
        $raw = mb_strtolower(trim((string) $value));
        if ($raw === '' || mb_strlen($raw) > 191) {
            return null;
        }

        return preg_match('/^[\p{L}\p{N}_\-]+$/u', $raw) ? $raw : null;
    }

    /** @param  list<string>  $allowed */
    private static function enum(mixed $value, array $allowed): ?string
    {
        $raw = strtolower(trim((string) $value));
        if ($raw === '') {
            return null;
        }

        return in_array($raw, $allowed, true) ? $raw : null;
    }
}
