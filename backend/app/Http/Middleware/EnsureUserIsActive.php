<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && $user->is_active === false) {
            $user->currentAccessToken()?->delete();

            return response()->json([
                'message' => __('api.forbidden'),
                'errors' => ['code' => 'ACCOUNT_DISABLED'],
            ], 403);
        }

        return $next($request);
    }
}
