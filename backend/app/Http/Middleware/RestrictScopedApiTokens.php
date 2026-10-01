<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Tokens minted for the WordPress plugin can only call the import API.
 */
class RestrictScopedApiTokens
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->user()?->currentAccessToken();
        if ($token instanceof PersonalAccessToken && $this->importOnly($token)) {
            $path = trim($request->path(), '/');
            if (! str_contains($path, 'api/v1/import/wordpress')) {
                return response()->json([
                    'message' => 'This token can only push WordPress imports.',
                    'errors' => ['code' => 'TOKEN_SCOPE'],
                ], 403);
            }
        }

        return $next($request);
    }

    private function importOnly(PersonalAccessToken $token): bool
    {
        if (str_starts_with((string) $token->name, 'wordpress-import:')) {
            return true;
        }
        $abilities = is_array($token->abilities) ? $token->abilities : [];

        return $abilities === ['wordpress-import'];
    }
}
