<?php

namespace App\Services\Seo;

use App\Models\SeoRedirect;
use App\Models\WordpressRedirect;
use Illuminate\Support\Collection;

final class SeoRedirectService
{
    public function normalizePath(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            return '/';
        }
        $parsed = parse_url($path, PHP_URL_PATH);
        $path = is_string($parsed) && $parsed !== '' ? $parsed : $path;
        if (! str_starts_with($path, '/')) {
            $path = '/'.$path;
        }
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }

        return $path;
    }

    /** Safely percent-decode (multi-pass, UTF-8 checked) and NFC-normalise a path. */
    public function decodePath(string $path): string
    {
        $decoded = $path;
        // Decode repeatedly (double-encoded imports) but stop on invalid UTF-8.
        for ($i = 0; $i < 3 && str_contains($decoded, '%'); $i++) {
            $next = rawurldecode($decoded);
            if ($next === $decoded || ! mb_check_encoding($next, 'UTF-8')) {
                break;
            }
            $decoded = $next;
        }

        return class_exists(\Normalizer::class) ? (\Normalizer::normalize($decoded, \Normalizer::FORM_C) ?: $decoded) : $decoded;
    }

    /**
     * Equivalent spellings of one path so Persian slugs match whether the row/request is decoded,
     * percent-encoded (upper- or lowercase hex, as WordPress stores it) or carries a trailing slash.
     *
     * @return list<string>
     */
    public function pathVariants(string $path): array
    {
        $decoded = $this->decodePath($path);
        $upper = implode('/', array_map(fn ($seg) => rawurlencode($seg), explode('/', $decoded)));
        $lower = preg_replace_callback('/%[0-9A-F]{2}/', fn ($m) => strtolower($m[0]), $upper) ?? $upper;
        $out = [];
        foreach ([$path, $decoded, $upper, $lower] as $v) {
            $v = $v === '/' ? '/' : rtrim($v, '/');
            if ($v === '') {
                continue;
            }
            $out[] = $v;
            if ($v !== '/') {
                $out[] = $v.'/';
            }
        }

        return array_values(array_unique($out));
    }

    /**
     * Manual SEO redirects win; otherwise fall back to WordPress-import permalinks/redirects
     * (old WP URLs → native paths) so a migrated store keeps its 301s.
     */
    public function find(int $tenantId, string $fromPath): SeoRedirect|WordpressRedirect|null
    {
        $from = $this->normalizePath($fromPath);

        $manual = SeoRedirect::query()
            ->where('tenant_id', $tenantId)
            ->where('enabled', true)
            ->whereIn('from_path', $this->pathVariants($from))
            ->orderByDesc('id')
            ->first();
        if ($manual !== null || $from === '/') {
            return $manual;
        }

        return $this->findImported($tenantId, $from) ?? $this->productRootRedirect($tenantId, $from);
    }

    /** WooCommerce system pages that the storefront renders natively (imported page copies are empty shells). */
    public const NATIVE_STORE_PAGES = [
        'shop' => '/shop', 'cart' => '/cart', 'checkout' => '/checkout', 'my-account' => '/my-account',
        'compare' => '/compare', 'wishlist' => '/wishlist', 'amazing-offers' => '/amazing-offers', 'search' => '/search',
    ];

    /** Native path for an imported WC page target like /pages/shop-2, /shop-2 or /pages/my-account; null otherwise. */
    public static function nativeStorePath(string $path): ?string
    {
        if (preg_match('#^/(?:pages/)?([a-z-]+?)(?:-\d+)?$#', $path, $m) !== 1) {
            return null;
        }

        return self::NATIVE_STORE_PAGES[$m[1]] ?? null;
    }

    /** Root permalink stores: /product/{slug} → /{slug} (301). */
    private function productRootRedirect(int $tenantId, string $from): ?SeoRedirect
    {
        if (preg_match('#^/product/([^/]+)$#', $from, $m) !== 1) {
            return null;
        }
        $to = SeoSettingsService::productPathFor(app(SeoSettingsService::class)->get($tenantId), $m[1]);
        if ($to === $from) {
            return null;
        }

        return new SeoRedirect(['tenant_id' => $tenantId, 'from_path' => $from, 'to_path' => $to, 'status_code' => 301, 'enabled' => true]);
    }

    private function findImported(int $tenantId, string $from): ?WordpressRedirect
    {
        $variants = $this->pathVariants($from);
        $decoded = rtrim($this->decodePath($from), '/') ?: '/';
        // Native storefront routes (/shop, /cart, /my-account…) must never bounce to imported empty WC page shells.
        if (isset(self::NATIVE_STORE_PAGES[ltrim($decoded, '/')])) {
            return null;
        }

        $row = WordpressRedirect::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('from_path', $variants)
            ->orderByDesc('id')
            ->first();
        if ($row === null) {
            return null;
        }
        $to = $this->normalizePath((string) $row->to_path);
        // Root permalink stores (product_permalink_base = ''): /{slug} is itself canonical, never bounce it to /product/{slug}.
        if (str_starts_with($to, '/product/')) {
            $to = SeoSettingsService::productPathFor(app(SeoSettingsService::class)->get($tenantId), substr($to, strlen('/product/')));
        }
        $to = self::nativeStorePath(rawurldecode($to)) ?? $to;
        if (rawurldecode($to) === $decoded || $to === '') {
            return null;
        }
        $row->to_path = $to;
        $row->status_code = in_array((int) $row->status_code, [301, 302, 307, 308], true) ? (int) $row->status_code : 301;

        return $row;
    }

    /** @return Collection<int, SeoRedirect> */
    public function list(int $tenantId): Collection
    {
        return SeoRedirect::query()
            ->where('tenant_id', $tenantId)
            ->orderByDesc('id')
            ->limit(2000)
            ->get();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function upsert(int $tenantId, array $data, ?int $id = null): SeoRedirect
    {
        $from = $this->normalizePath((string) ($data['from_path'] ?? ''));
        $to = $this->normalizePath((string) ($data['to_path'] ?? ''));
        $code = (int) ($data['status_code'] ?? 301);
        if (! in_array($code, [301, 302, 307, 308], true)) {
            $code = 301;
        }
        if ($from === $to) {
            throw new \InvalidArgumentException('from_path and to_path must differ');
        }
        $payload = [
            'tenant_id' => $tenantId,
            'from_path' => $from,
            'to_path' => $to,
            'status_code' => $code,
            'enabled' => ($data['enabled'] ?? true) !== false,
            'note' => mb_substr((string) ($data['note'] ?? ''), 0, 255),
        ];
        if ($id) {
            $row = SeoRedirect::query()->where('tenant_id', $tenantId)->findOrFail($id);
            $row->fill($payload)->save();

            \App\Support\PublicCache\PublicResponseCache::bump($tenantId);

            return $row->fresh();
        }

        $row = SeoRedirect::query()->updateOrCreate(
            ['tenant_id' => $tenantId, 'from_path' => $from],
            $payload
        );
        \App\Support\PublicCache\PublicResponseCache::bump($tenantId);

        return $row;
    }

    public function delete(int $tenantId, int $id): void
    {
        SeoRedirect::query()->where('tenant_id', $tenantId)->where('id', $id)->delete();
        \App\Support\PublicCache\PublicResponseCache::bump($tenantId);
    }
}
