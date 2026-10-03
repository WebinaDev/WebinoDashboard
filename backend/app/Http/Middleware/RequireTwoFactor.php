<?php

namespace App\Http\Middleware;

use App\Services\Auth\StaffImpersonationService;
use App\Services\Security\SecuritySettings;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireTwoFactor
{
    public function handle(Request $request, Closure $next): Response
    {
        if (app(StaffImpersonationService::class)->isImpersonating($request)) {
            return $next($request);
        }

        if (app()->environment('testing')) {
            return $next($request);
        }

        $user = $request->user();
        if (! $user) {
            return $next($request);
        }

        $mustEnforce = $this->mustEnforce($user);
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

    private function mustEnforce(object $user): bool
    {
        $userRole = (string) ($user->role ?? '');
        if ($userRole === '') {
            return false;
        }

        $enforceRoles = config('auth.enforce_2fa_roles', 'admin');
        $roles = array_values(array_filter(array_map('trim', explode(',', (string) $enforceRoles))));
        if ($userRole !== '' && in_array($userRole, $roles, true)) {
            return true;
        }

        // Tenant security setting: force 2FA for admins / shop managers.
        $tenantId = (int) ($user->tenant_id ?? 0);
        if ($tenantId <= 0) {
            return false;
        }

        try {
            $settings = SecuritySettings::get($tenantId);
        } catch (\Throwable) {
            return false;
        }

        if (empty($settings['general']['enabled']) || empty($settings['login']['force_2fa_admins'])) {
            return false;
        }

        return in_array($userRole, ['admin', 'shop_manager', 'owner'], true);
    }
}
