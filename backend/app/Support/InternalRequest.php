<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Server-to-server calls from our own frontend container (Next.js SSR / middleware). All SSR traffic shares
 * one source IP, so the per-IP guest limiter answered 429 on busy sites. Proof is a shared secret
 * (WEBINO_INTERNAL_API_SECRET, ≥16 chars) in X-Webino-Internal — never the source IP or forwarding headers,
 * which a public client can spoof. Edge proxies should also strip X-Webino-Internal from inbound requests.
 */
final class InternalRequest
{
    public const HEADER = 'X-Webino-Internal';

    public static function is(Request $request): bool
    {
        $secret = (string) config('webino_runtime.internal_api_secret', '');
        $given = (string) $request->header(self::HEADER, '');

        return strlen($secret) >= 16 && $given !== '' && hash_equals($secret, $given);
    }
}
