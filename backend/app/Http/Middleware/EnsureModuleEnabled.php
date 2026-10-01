<?php

namespace App\Http\Middleware;

use App\Kernel\ModuleAliasMap;
use App\Kernel\ModuleDiscovery;
use App\Models\DashboardModule;
use App\Models\TenantModule;
use App\Models\TenantSubmoduleActivation;
use App\Models\User;
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

            if ($row->licensed === false && ! $this->domainEntitled($user)) {
                return $this->unlicensed($slug);
            }

            if ($deny = $this->denyIfGitCodeMissing($moduleSlug)) {
                return $deny;
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

        if ($row->licensed === false && ! $this->domainEntitled($user)) {
            return $this->unlicensed($slug);
        }

        if ($deny = $this->denyIfGitCodeMissing($slug)) {
            return $deny;
        }

        return $next($request);
    }

    /**
     * Domain (+ product) is the license identity. An active/demo tenant stays
     * entitled even when a sync left submodule `licensed` false.
     */
    private function domainEntitled(mixed $user): bool
    {
        if (! $user instanceof User) {
            return false;
        }

        $tenant = $user->relationLoaded('tenant') ? $user->tenant : $user->tenant()->first();

        return $tenant?->isLicenseEntitled() ?? false;
    }

    private function denyIfGitCodeMissing(string $moduleSlug): ?Response
    {
        $def = DashboardModule::query()->find($moduleSlug);
        if (! $def || ($def->distribution ?? 'bundled') !== 'git') {
            return null;
        }

        $discovery = app(ModuleDiscovery::class);
        if (! $discovery->codePresent($moduleSlug)) {
            return response()->json([
                'message' => 'Module not installed from git',
                'errors' => ['module' => $moduleSlug, 'code' => 'MODULE_NOT_INSTALLED'],
            ], 403);
        }

        return null;
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
