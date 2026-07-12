<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateFromCookie
{
    public function handle(Request $request, Closure $next): Response
    {
        $cookieName = config('auth.cookie_name', 'webino_auth_token');

        if (! $request->bearerToken() && $request->cookie($cookieName)) {
            $request->headers->set(
                'Authorization',
                'Bearer '.$request->cookie($cookieName)
            );
        }

        return $next($request);
    }
}
