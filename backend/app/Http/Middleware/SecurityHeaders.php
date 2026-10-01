<?php

namespace App\Http\Middleware;

use App\Services\Security\SecuritySettings;
use App\Services\Tenant\TenantResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        $tenantId = $this->resolveTenantId($request);
        if ($tenantId <= 0) {
            return $response;
        }

        $settings = SecuritySettings::get($tenantId);
        if (empty($settings['general']['enabled'])) {
            return $response;
        }

        $headers = $settings['headers'] ?? [];
        if (! empty($headers['x_frame_options'])) {
            $response->headers->set('X-Frame-Options', (string) $headers['x_frame_options']);
        }
        if (! empty($headers['referrer_policy'])) {
            $response->headers->set('Referrer-Policy', (string) $headers['referrer_policy']);
        }
        if (! empty($headers['x_content_type_options'])) {
            $response->headers->set('X-Content-Type-Options', (string) $headers['x_content_type_options']);
        }
        if (! empty($headers['permissions_policy'])) {
            $response->headers->set('Permissions-Policy', (string) $headers['permissions_policy']);
        }

        $privacy = $settings['privacy'] ?? [];
        if (! empty($privacy['hide_app_fingerprint'])) {
            $response->headers->remove('X-Powered-By');
            $response->headers->remove('Server');
            $response->headers->set('X-Content-Type-Options', $response->headers->get('X-Content-Type-Options') ?: 'nosniff');
        }

        if (! empty($privacy['disable_dangerous_debug']) && ! app()->environment('local', 'testing')) {
            // Never expose debug stack traces via headers when privacy flag is on.
            $response->headers->remove('X-Debug-Token');
            $response->headers->remove('X-Debug-Token-Link');
        }

        return $response;
    }

    private function resolveTenantId(Request $request): int
    {
        $user = $request->user();
        if ($user && isset($user->tenant_id)) {
            return (int) $user->tenant_id;
        }

        try {
            $tenant = app(TenantResolver::class)->identifyFromRequest($request);

            return $tenant ? (int) $tenant->id : 0;
        } catch (\Throwable) {
            return 0;
        }
    }
}
