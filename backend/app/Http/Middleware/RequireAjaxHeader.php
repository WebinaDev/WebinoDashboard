<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cookie-authenticated APIs need a second CSRF layer: browsers do not send
 * custom headers on simple cross-site form posts.
 */
class RequireAjaxHeader
{
    public function handle(Request $request, Closure $next): Response
    {
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        $path = trim($request->path(), '/');
        if (
            str_contains($path, '/webhook')
            || str_ends_with($path, '/webhook')
            || str_contains($path, 'webhooks/')
            || str_starts_with($path, 'api/v1/public/')
            || str_starts_with($path, 'api/v1/provision/')
            || str_starts_with($path, 'api/v1/payments/callback')
        ) {
            return $next($request);
        }

        $requestedWith = (string) $request->header('X-Requested-With', '');
        $acceptsJson = $request->expectsJson()
            || str_contains((string) $request->header('Accept', ''), 'application/json');

        if (strcasecmp($requestedWith, 'XMLHttpRequest') !== 0 && ! $acceptsJson) {
            return response()->json([
                'message' => 'Missing X-Requested-With header',
                'errors' => ['code' => 'AJAX_REQUIRED'],
            ], 403);
        }

        if ($request->cookie(config('auth.cookie_name', 'webino_auth_token'))
            && strcasecmp($requestedWith, 'XMLHttpRequest') !== 0
            && ! $request->bearerToken()) {
            return response()->json([
                'message' => 'Missing X-Requested-With header',
                'errors' => ['code' => 'AJAX_REQUIRED'],
            ], 403);
        }

        return $next($request);
    }
}
