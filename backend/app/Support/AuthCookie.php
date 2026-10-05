<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Auth cookie is HttpOnly + Secure (when HTTPS) + SameSite=Lax.
 *
 * Not encrypted via EncryptCookies: Next.js middleware reads the raw cookie and
 * forwards it as Bearer to /api/v1/auth/gate. Encrypting would break that gate
 * unless the edge layer could decrypt Laravel cookies (not feasible here).
 * The cookie remains excluded from EncryptCookies in bootstrap/app.php for that reason.
 */
final class AuthCookie
{
    public static function attach(JsonResponse $response, string $token, Request $request, ?int $maxMinutes = null): JsonResponse
    {
        return $response->cookie(
            config('auth.cookie_name', 'webino_auth_token'),
            $token,
            $maxMinutes ?? (int) config('auth.cookie_max_minutes', 60 * 24 * 7),
            '/',
            null,
            $request->secure(),
            true,
            false,
            'lax'
        );
    }

    public static function clear(JsonResponse $response, Request $request): JsonResponse
    {
        return $response->cookie(
            config('auth.cookie_name', 'webino_auth_token'),
            '',
            -1,
            '/',
            null,
            $request->secure(),
            true,
            false,
            'lax'
        );
    }
}
