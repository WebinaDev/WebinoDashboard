<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * API messages follow the UI language: X-Locale header, then the NEXT_LOCALE cookie, then Persian on public routes.
 * Browser Accept-Language is ignored on purpose (en-US browsers on a Persian storefront got English
 * errors such as "The venue is not taking orders right now.").
 */
class SetRequestLocale
{
    private const SUPPORTED = ['fa', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        $candidates = [
            (string) $request->header('X-Locale', ''),
            (string) $request->cookie('NEXT_LOCALE', ''),
        ];
        // Public storefront APIs default to Persian; admin APIs keep the app locale.
        $locale = $request->is('api/v1/public/*') ? 'fa' : (string) config('app.locale', 'en');
        foreach ($candidates as $c) {
            $c = strtolower(substr(trim($c), 0, 2));
            if (in_array($c, self::SUPPORTED, true)) {
                $locale = $c;
                break;
            }
        }
        app()->setLocale($locale);

        return $next($request);
    }
}
