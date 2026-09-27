<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureStaffRole
{
    /** Roles allowed into back-office APIs; everyone else is limited to the account portal. */
    public const ROLES = [
        'admin',
        'staff',
        'shop_manager',
        'seller',
        'accountant',
        'author',
        'editor',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || ! in_array((string) $user->role, self::ROLES, true)) {
            return response()->json([
                'message' => __('api.forbidden'),
                'errors' => ['code' => 'STAFF_ONLY'],
            ], 403);
        }

        return $next($request);
    }
}
