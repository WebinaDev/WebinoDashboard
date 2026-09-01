<?php

namespace App\Http\Middleware;

use App\Kernel\ModuleAliasMap;
use App\Kernel\TenantActivationService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePublicModuleEnabled
{
    public function __construct(private readonly TenantActivationService $activations) {}

    public function handle(Request $request, Closure $next, string $slug): Response
    {
        $tenantId = $request->attributes->get('public_tenant_id');
        if (! $tenantId) {
            return response()->json(['message' => __('api.tenant_not_found')], 404);
        }

        $resolved = ModuleAliasMap::resolve($slug);
        if ($resolved !== null) {
            [$moduleSlug, $subSlug] = $resolved;
            if (! $this->activations->isSubmoduleEnabled((int) $tenantId, $moduleSlug, $subSlug)) {
                return response()->json(['message' => __('api.module_disabled')], 404);
            }

            return $next($request);
        }

        if (! $this->activations->isModuleEnabled((int) $tenantId, $slug)) {
            return response()->json(['message' => __('api.module_disabled')], 404);
        }

        return $next($request);
    }
}
