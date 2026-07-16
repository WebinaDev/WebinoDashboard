<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireTwoFactor
{
    public function handle(Request $request, Closure $next): Response
    {
        if (app()->environment('testing')) {
            return $next($request);
        }

        $user = $request->user();
        if (! $user) {
            return $next($request);
        }

        $enforceRoles = config('auth.enforce_2fa_roles', 'admin');
        $roles = array_values(array_filter(array_map('trim', explode(',', (string) $enforceRoles))));
        $userRole = (string) ($user->role ?? '');
        $mustEnforce = $userRole !== '' && in_array($userRole, $roles, true);

        if ($mustEnforce && (! $user->two_factor_secret || ! $user->two_factor_confirmed_at)) {
            $allowed = [
                'v1/auth/2fa/status',
                'v1/auth/2fa/enable',
                'v1/auth/2fa/confirm',
                'v1/auth/2fa/verify',
                'v1/auth/logout',
                'v1/auth/check',
                'v1/auth/user',
                'v1/auth/refresh',
                'api/v1/auth/2fa/status',
                'api/v1/auth/2fa/enable',
                'api/v1/auth/2fa/confirm',
                'api/v1/auth/2fa/verify',
                'api/v1/auth/logout',
                'api/v1/auth/check',
                'api/v1/auth/user',
                'api/v1/auth/refresh',
            ];
            if (! in_array($request->path(), $allowed, true)) {
                return response()->json([
                    'two_factor_setup_required' => true,
                    'message' => __('auth.two_factor_setup_required'),
                ], 403);
            }
        }

        return $next($request);
    }
}
