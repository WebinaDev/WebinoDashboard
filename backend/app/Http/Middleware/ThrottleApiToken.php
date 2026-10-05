<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

class ThrottleApiToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $limit = (int) env('API_RATE_LIMIT_PER_MINUTE', 120);
        $limit = max(1, $limit);

        $token = $user?->currentAccessToken();
        $key = $token !== null
            ? 'api-token:'.$token->id
            : 'api-user:'.($user?->id ?? 'guest').'|'.$request->ip();

        $authSensitive = $this->isAuthSensitive($request);

        try {
            if (RateLimiter::tooManyAttempts($key, $limit)) {
                $retryAfter = RateLimiter::availableIn($key);

                return response()->json([
                    'message' => __('tokens.rate_limited'),
                ], 429)->withHeaders([
                    'Retry-After' => (string) $retryAfter,
                    'X-RateLimit-Limit' => (string) $limit,
                    'X-RateLimit-Remaining' => '0',
                ]);
            }

            RateLimiter::hit($key, 60);
        } catch (\Throwable $e) {
            Log::warning('ThrottleApiToken cache failure: '.$e->getMessage(), [
                'path' => $request->path(),
                'auth_sensitive' => $authSensitive,
            ]);

            // Fail closed on auth-sensitive routes when the limiter store is down
            // (abuse-sensitive). Other routes keep a local fail-open fallback.
            if ($authSensitive) {
                return response()->json([
                    'message' => __('tokens.rate_limited'),
                ], 503);
            }

            return $next($request);
        }

        $response = $next($request);

        try {
            $remaining = max(0, $limit - RateLimiter::attempts($key));
            if ($response instanceof Response) {
                $response->headers->set('X-RateLimit-Limit', (string) $limit);
                $response->headers->set('X-RateLimit-Remaining', (string) $remaining);
            }
        } catch (\Throwable $e) {
            Log::warning('ThrottleApiToken header fail-open: '.$e->getMessage());
        }

        return $response;
    }

    private function isAuthSensitive(Request $request): bool
    {
        $path = trim($request->path(), '/');

        return str_contains($path, 'auth/login')
            || str_contains($path, 'auth/register')
            || str_contains($path, 'auth/otp')
            || str_contains($path, 'auth/password')
            || str_contains($path, 'auth/forgot')
            || str_contains($path, 'auth/reset')
            || str_contains($path, 'two-factor')
            || str_contains($path, '2fa');
    }
}
