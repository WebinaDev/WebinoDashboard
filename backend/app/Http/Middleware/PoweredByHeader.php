<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Replace PHP's X-Powered-By with the product fingerprint (Wappalyzer).
 * Skipped when the tenant enabled privacy.hide_app_fingerprint (SecurityHeaders flags the request).
 */
class PoweredByHeader
{
    public const VALUE = 'Webina Dashboard';

    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        if ($request->attributes->get('webina.hide_fingerprint') === true) {
            $response->headers->remove('X-Powered-By');
            if (function_exists('header_remove') && ! headers_sent()) {
                header_remove('X-Powered-By');
            }

            return $response;
        }

        $response->headers->set('X-Powered-By', self::VALUE);

        return $response;
    }
}
