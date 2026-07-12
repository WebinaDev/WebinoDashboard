<?php

namespace App\Http\Middleware;

use App\Models\TenantModule;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureModuleEnabled
{
    public function handle(Request $request, Closure $next, string $slug): Response
    {
        $user = $request->user();
        if (! $user || ! $user->tenant_id) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $active = TenantModule::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('module_slug', $slug)
            ->where('enabled', true)
            ->exists();

        if (! $active) {
            return response()->json([
                'message' => 'Module disabled for tenant.',
                'module' => $slug,
            ], 403);
        }

        return $next($request);
    }
}
