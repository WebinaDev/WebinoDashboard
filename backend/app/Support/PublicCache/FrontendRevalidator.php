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

    /** @param  list<string>  $tags */
    public static function send(array $tags = self::TAGS): bool
    {
        if (! self::enabled()) {
            return false;
        }
        $secret = (string) config('services.frontend_revalidate.secret', '');
        try {
            return Http::timeout(3)
                ->withHeaders($secret !== '' ? ['x-revalidate-secret' => $secret] : [])
                ->post(self::url(), ['tags' => array_values($tags)])
                ->successful();
        } catch (\Throwable) {
            return false;
        }
    }
}
