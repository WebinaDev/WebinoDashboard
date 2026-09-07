<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class AuthCookie
{
    public static function attach(JsonResponse $response, string $token, Request $request): JsonResponse
    {
        return $response->cookie(
            config('auth.cookie_name', 'webino_auth_token'),
            $token,
            config('auth.cookie_max_minutes', 60 * 24 * 7),
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
