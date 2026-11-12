<?php

namespace App\Http\Middleware;

use App\Services\Membership\MembershipService;
use App\Services\Poetry\PoetryScope;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Optional auth for public poetry/media routes.
 *
 * The SPA is Cookie+Bearer, not Sanctum session auth: AuthenticateFromCookie
 * copies the HttpOnly webino_auth_token cookie into Authorization, then
 * auth('sanctum') resolves the user. Guests stay anonymous — never 401.
 *
 * Do not enable EnsureFrontendRequestsAreStateful here or globally; that
 * starts CSRF/session on /api/* and breaks login when APP_URL is stateful.
 *
 * Responses vary by visitor so unlocked premium bodies are never stored in a
 * shared cache (CDN, proxy, or CachePublicResponse).
 */
class OptionalPublicAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = auth('sanctum')->user();
        if (! $request->attributes->has('poetry_full_access')) {
            $request->attributes->set(
                'poetry_full_access',
                app(MembershipService::class)->hasFullAccess((int) PoetryScope::id(), $user)
            );
        }

        $response = $next($request);

        return $this->withCacheHeaders($response, (bool) $request->attributes->get('poetry_full_access'));
    }

    private function withCacheHeaders(Response $response, bool $fullAccess): Response
    {
        $vary = array_values(array_filter(array_map('trim', explode(',', (string) $response->headers->get('Vary', '')))));
        foreach (['Authorization', 'Cookie', 'X-Tenant-Domain'] as $header) {
            if (! in_array($header, $vary, true)) {
                $vary[] = $header;
            }
        }
        $response->headers->set('Vary', implode(', ', $vary));
        $response->headers->set('Cache-Control', $fullAccess ? 'private, no-store' : 'private, no-cache');

        return $response;
    }
}
