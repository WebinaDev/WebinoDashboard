<?php

namespace App\Http\Middleware;

use App\Kernel\ModuleAliasMap;
use App\Kernel\TenantActivationService;
use App\Models\Tenant;
use App\Models\TenantModule;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureModuleEnabled
{
    public function __construct(private readonly TenantActivationService $activations) {}

    public function handle(Request $request, Closure $next, string $slug): Response
    {
        $user = $request->user();
        if (! $user || ! $user->tenant_id) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }

        $resolved = ModuleAliasMap::resolve($slug);
        if ($resolved !== null) {
            [$moduleSlug, $subSlug] = $resolved;
            if (! $this->activations->isSubmoduleEnabled($user->tenant_id, $moduleSlug, $subSlug)) {
                return $this->disabled($slug);
            }

            return $next($request);
        }

        $active = TenantModule::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('module_slug', $slug)
            ->where('enabled', true)
            ->exists();

        if (! $active) {
            return $this->disabled($slug);
        }

        return $next($request);
    }

    private function disabled(string $slug): Response
    {
        return response()->json([
            'message' => __('api.module_disabled'),
            'errors' => ['module' => $slug],
        ], 403);
    }
}
