<?php

namespace App\Http\Middleware;

use App\Kernel\ModuleAliasMap;
use App\Models\TenantModule;
use App\Models\TenantSubmoduleActivation;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureModuleEnabled
{
    public function handle(Request $request, Closure $next, string $slug): Response
    {
        $user = $request->user();
        if (! $user || ! $user->tenant_id) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }

        $resolved = ModuleAliasMap::resolve($slug);
        if ($resolved !== null) {
            [$moduleSlug, $subSlug] = $resolved;
            $row = TenantSubmoduleActivation::query()
                ->where('tenant_id', $user->tenant_id)
                ->where('module_slug', $moduleSlug)
                ->where('submodule_slug', $subSlug)
                ->first();

            if (! $row || ! $row->enabled) {
                return $this->disabled($slug);
            }

            if ($row->licensed === false) {
                return $this->unlicensed($slug);
            }

            return $next($request);
        }

        $row = TenantModule::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('module_slug', $slug)
            ->first();

        if (! $row || ! $row->enabled) {
            return $this->disabled($slug);
        }

        if ($row->licensed === false) {
            return $this->unlicensed($slug);
        }

        return $next($request);
    }

    private function disabled(string $slug): Response
    {
        return response()->json([
            'message' => __('api.module_disabled'),
            'errors' => ['module' => $slug, 'code' => 'MODULE_NOT_ACTIVE'],
        ], 403);
    }

    private function unlicensed(string $slug): Response
    {
        return response()->json([
            'message' => __('api.module_not_licensed'),
            'errors' => ['module' => $slug, 'code' => 'MODULE_NOT_LICENSED'],
        ], 403);
    }
}
