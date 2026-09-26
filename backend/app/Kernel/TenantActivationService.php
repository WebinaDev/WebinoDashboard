<?php

namespace App\Kernel;

use App\Models\DashboardModule;
use App\Models\SiteTypeActivation;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\TenantSubmoduleActivation;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class TenantActivationService
{
    public function applySiteType(Tenant $tenant, string $siteTypeSlug): void
    {
        if (! SiteTypeProfiles::isValid($siteTypeSlug)) {
            throw new \InvalidArgumentException("Invalid site type: {$siteTypeSlug}");
        }

        // Ensure dashboard_modules / site_type_activations exist before FK writes.
        try {
            app(ModuleRegistry::class)->boot();
        } catch (\Throwable) {
            // Catalog sync is best-effort; profile fallback below still works.
        }

        $profile = SiteTypeProfiles::all()[$siteTypeSlug];

        DB::transaction(function () use ($tenant, $siteTypeSlug, $profile) {
            $tenant->site_type_slug = $siteTypeSlug;
            $tenant->business_type_slug = $siteTypeSlug;
            $tenant->active_theme_slug = $profile['theme'];
            $tenant->theme_preset = $siteTypeSlug;
            $tenant->save();

            $activations = SiteTypeActivation::query()->where('site_type_slug', $siteTypeSlug)->get();
            if ($activations->isEmpty()) {
                foreach ($profile['modules'] as $moduleSlug => $submodules) {
                    foreach ($submodules as $subSlug) {
                        $activations->push(new SiteTypeActivation([
                            'site_type_slug' => $siteTypeSlug,
                            'module_slug' => $moduleSlug,
                            'submodule_slug' => $subSlug,
                            'enabled_by_default' => true,
                        ]));
                    }
                }
            }

            $allowedKeys = collect($activations)->mapWithKeys(fn (SiteTypeActivation $a) => [
                "{$a->module_slug}.{$a->submodule_slug}" => true,
            ]);

            $allModules = DashboardModule::query()->pluck('slug');
            foreach ($allModules as $moduleSlug) {
                TenantModule::query()->updateOrCreate(
                    ['tenant_id' => $tenant->id, 'module_slug' => $moduleSlug],
                    [
                        'enabled' => $moduleSlug === 'core' || $this->moduleHasEnabledSubmodule($tenant, $moduleSlug, $allowedKeys),
                        'licensed' => true,
                    ]
                );
            }

            TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenant->id)
                ->update(['enabled' => false]);

            $knownModules = DashboardModule::query()->pluck('slug')->flip();

            foreach ($activations as $activation) {
                TenantSubmoduleActivation::query()->updateOrCreate(
                    [
                        'tenant_id' => $tenant->id,
                        'module_slug' => $activation->module_slug,
                        'submodule_slug' => $activation->submodule_slug,
                    ],
                    [
                        'enabled' => true,
                        'licensed' => true,
                    ]
                );

                if (! $knownModules->has($activation->module_slug)) {
                    continue;
                }

                TenantModule::query()->updateOrCreate(
                    ['tenant_id' => $tenant->id, 'module_slug' => $activation->module_slug],
                    ['enabled' => true, 'licensed' => true]
                );
            }

            foreach (SiteTypeProfiles::coreSubmoduleKeys() as $key) {
                [$module, $sub] = explode('.', $key, 2);
                TenantSubmoduleActivation::query()->updateOrCreate(
                    ['tenant_id' => $tenant->id, 'module_slug' => $module, 'submodule_slug' => $sub],
                    ['enabled' => true, 'licensed' => true]
                );
            }

            TenantModule::query()->updateOrCreate(
                ['tenant_id' => $tenant->id, 'module_slug' => 'core'],
                ['enabled' => true, 'licensed' => true]
            );

            $this->syncLegacyModuleFlags($tenant);
        });

        $this->clearCache($tenant->id);
    }

    private function syncLegacyModuleFlags(Tenant $tenant): void
    {
        // Only write tenant_modules rows whose slug exists in dashboard_modules.
        // Routes use ModuleAliasMap → tenant_submodule_activations; legacy tenant_modules
        // slugs (catalog, dashboard, …) are not dashboard_modules PKs and would FK-fail.
        $known = DashboardModule::query()->pluck('slug')->flip();

        foreach (ModuleAliasMap::legacyPairs() as $legacySlug => [$module, $sub]) {
            if (! $known->has($legacySlug)) {
                continue;
            }
            $enabled = $this->isSubmoduleEnabled($tenant->id, $module, $sub);
            TenantModule::query()->updateOrCreate(
                ['tenant_id' => $tenant->id, 'module_slug' => $legacySlug],
                ['enabled' => $enabled, 'licensed' => true]
            );
        }
    }

    /** @param \Illuminate\Support\Collection<string, bool> $allowedKeys */
    private function moduleHasEnabledSubmodule(Tenant $tenant, string $moduleSlug, $allowedKeys): bool
    {
        return $allowedKeys->keys()->contains(fn (string $key) => str_starts_with($key, "{$moduleSlug}."));
    }

    public function isSubmoduleEnabled(int $tenantId, string $moduleSlug, string $submoduleSlug): bool
    {
        if ($moduleSlug === 'core') {
            return true;
        }

        $cacheKey = "tenant:{$tenantId}:sub:{$moduleSlug}.{$submoduleSlug}";

        return Cache::remember($cacheKey, 60, function () use ($tenantId, $moduleSlug, $submoduleSlug) {
            return TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenantId)
                ->where('module_slug', $moduleSlug)
                ->where('submodule_slug', $submoduleSlug)
                ->where('enabled', true)
                ->where('licensed', true)
                ->exists();
        });
    }

    public function isModuleEnabled(int $tenantId, string $moduleSlug): bool
    {
        if ($moduleSlug === 'core') {
            return true;
        }

        return TenantModule::query()
            ->where('tenant_id', $tenantId)
            ->where('module_slug', $moduleSlug)
            ->where('enabled', true)
            ->where('licensed', true)
            ->exists();
    }

    public function clearCache(int $tenantId): void
    {
        Cache::forget("modules:tenant:{$tenantId}");
        Cache::forget("kernel:tenant:{$tenantId}:activations");
    }

    /** @return list<array{module_slug: string, submodule_slug: string, enabled: bool, licensed: bool}> */
    public function activationsForTenant(int $tenantId): array
    {
        return Cache::remember("kernel:tenant:{$tenantId}:activations", 60, function () use ($tenantId) {
            return TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenantId)
                ->get()
                ->map(fn (TenantSubmoduleActivation $a) => [
                    'module_slug' => $a->module_slug,
                    'submodule_slug' => $a->submodule_slug,
                    'enabled' => (bool) $a->enabled,
                    'licensed' => (bool) $a->licensed,
                ])
                ->values()
                ->all();
        });
    }
}
