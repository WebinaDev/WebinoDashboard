<?php

namespace App\Http\Middleware;

use App\Support\PublicCache\PublicResponseCache;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side cache for anonymous public GETs, keyed by tenant version + host + locale + URL.
 * 200 → 300s; 404/422 → 60s (negative cache). Hoists base64 images to files. Skipped when authenticated.
 * PUBLIC_API_CACHE=false disables.
 */
class CachePublicResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $tid = (int) $request->attributes->get('public_tenant_id');
        if (! config('webino_runtime.public_api_cache', true) || ! in_array($request->getMethod(), ['GET', 'HEAD'], true) || $tid <= 0
            || $request->bearerToken() || $request->cookie(config('auth.cookie_name', 'webino_auth_token'))) {
            $response = $this->finish($next($request), $tid);
            $response->headers->set('X-Public-Cache', 'BYPASS');

            return $response;
        }

        $key = 'pubcache:r:'.$tid.':'.PublicResponseCache::version($tid).':'.sha1(implode('|', [
            strtolower((string) ($request->header('X-Tenant-Domain') ?: $request->getHost())),
            app()->getLocale(),
            $request->getPathInfo(),
            $request->getQueryString() ?? '',
        ]));

        try {
            $hit = Cache::get($key);
        } catch (\Throwable) {
            $hit = null;
        }
        if (is_array($hit) && isset($hit['s'], $hit['b'])) {
            return response($hit['b'], (int) $hit['s'], ['Content-Type' => 'application/json', 'X-Public-Cache' => 'HIT'] + ($hit['h'] ?? []));
        }

        $response = $this->finish($next($request), $tid);
        $status = $response->getStatusCode();
        if (in_array($status, [200, 404, 422], true) && ! $response->headers->has('Set-Cookie')
            && str_contains((string) $response->headers->get('Content-Type'), 'json')) {
            $headers = array_filter(['Cache-Control' => $response->headers->get('Cache-Control')]);
            try {
                Cache::put($key, ['s' => $status, 'b' => $response->getContent(), 'h' => $headers], $status === 200 ? PublicResponseCache::TTL : PublicResponseCache::NEGATIVE_TTL);
            } catch (\Throwable) {
            }
            $response->headers->set('X-Public-Cache', 'MISS');
        } else {
            $response->headers->set('X-Public-Cache', 'BYPASS');
        }

        return $response;
    }

    private function finish(Response $response, int $tid = 0): Response
    {
        if (str_contains((string) $response->headers->get('Content-Type'), 'json')) {
            $body = (string) $response->getContent();
            $hoisted = \App\Services\Media\WebpLinkRewriter::rewrite($tid, PublicResponseCache::hoistDataUrls($body));
            if ($hoisted !== $body) {
                $response->setContent($hoisted);
            }
        }

        return $response;
    }
}
