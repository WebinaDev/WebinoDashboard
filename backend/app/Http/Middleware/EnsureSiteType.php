<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSiteType
{
    public function handle(Request $request, Closure $next, string ...$types): Response
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }
        $slug = (string) (\App\Models\Tenant::query()->whereKey($user->tenant_id)->value('site_type_slug') ?? '');
        if ($slug === '' || ! in_array($slug, $types, true)) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return $next($request);
    }
}
