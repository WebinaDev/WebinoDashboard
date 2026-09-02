<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePasswordChange
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || ! $user->password_must_change) {
            return $next($request);
        }

        $allowed = [
            'api/v1/auth/change-password',
            'api/v1/auth/logout',
            'api/v1/auth/check',
            'api/v1/auth/user',
            'api/v1/auth/gate',
            'api/v1/auth/refresh',
            'v1/auth/change-password',
            'v1/auth/logout',
            'v1/auth/check',
            'v1/auth/user',
            'v1/auth/gate',
            'v1/auth/refresh',
        ];

        if (! in_array($request->path(), $allowed, true)) {
            return response()->json([
                'password_must_change' => true,
                'message' => __('auth.password_must_change'),
            ], 403);
        }

        return $next($request);
    }
}
