<?php

namespace App\Support\PublicCache;

use Illuminate\Support\Facades\Http;

/**
 * On-demand page cache (ISR) invalidation: after any tenant-scoped write, purge the Next.js data/route
 * cache tags once per request/job via the frontend's /webino-revalidate route.
 *
 * On by default: FRONTEND_REVALIDATE_URL defaults to the in-network frontend container
 * (http://frontend:3000/webino-revalidate). Opt out with WEBINO_PAGE_CACHE=off (the frontend then also
 * stops caching public reads). REVALIDATE_SECRET is sent when set; without it the frontend only accepts
 * direct in-network calls (no proxy forwarding headers).
 */
final class FrontendRevalidator
{
    public const TAGS = ['builder', 'tenant', 'seo', 'poetry', 'catalog'];

    private static bool $scheduled = false;

    public static function enabled(): bool
    {
        return strtolower((string) config('services.frontend_revalidate.page_cache', 'on')) !== 'off'
            && self::url() !== '';
    }

    public static function url(): string
    {
        return (string) config('services.frontend_revalidate.url', '');
    }

    /** Debounced: at most one POST per request lifecycle, sent after the response. */
    public static function schedule(): void
    {
        if (self::$scheduled || ! self::enabled() || app()->runningUnitTests()) {
            return;
        }
        self::$scheduled = true;
        app()->terminating(static function (): void {
            self::$scheduled = false;
            self::send();
        });
    }

    /**
     * Purge specific public paths (Next route cache + edge nginx) right away, e.g. a builder page on
     * publish/unpublish, so visitors never see the stale cached copy until the next tag sweep.
     *
     * @param  list<string>  $paths
     */
    public static function purgePaths(array $paths, ?string $host = null): bool
    {
        $paths = array_values(array_unique(array_filter($paths, static fn ($p) => is_string($p) && str_starts_with($p, '/'))));
        if ($paths === [] || ! self::enabled() || app()->runningUnitTests()) {
            return false;
        }

        return self::send(['builder', 'seo'], $paths, $host);
    }

    /** Public paths a CMS/builder page is reachable at (new flat URL plus the legacy /pages/ one). */
    public static function pagePaths(?string $slug, bool $isHome = false): array
    {
        $slug = trim((string) $slug, '/');
        $out = $isHome || $slug === '' || $slug === 'home' ? ['/'] : [];
        if ($slug !== '') {
            $enc = implode('/', array_map('rawurlencode', explode('/', $slug)));
            array_push($out, '/'.$enc, '/pages/'.$enc);
        }

        return $out;
    }

    /**
     * @param  list<string>  $tags
     * @param  list<string>  $paths
     */
    public static function send(array $tags = self::TAGS, array $paths = [], ?string $host = null): bool
    {
        if (! self::enabled()) {
            return false;
        }
        $secret = (string) config('services.frontend_revalidate.secret', '');
        try {
            return Http::timeout(3)
                ->withHeaders($secret !== '' ? ['x-revalidate-secret' => $secret] : [])
                ->post(self::url(), array_filter(['tags' => array_values($tags), 'paths' => array_values($paths), 'host' => $host], static fn ($v) => $v !== null && $v !== []))
                ->successful();
        } catch (\Throwable) {
            return false;
        }
    }
}
