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
    /**
     * Ensure parent module rows exist in dashboard_modules before any FK write
     * to tenant_modules / site_type_activations.
     *
     * @param  list<string>  $moduleSlugs
     * @param  array<string, array{distribution?: string, requires_license?: bool}>  $meta
     */
    public static function ensureDashboardModules(array $moduleSlugs, array $meta = []): void
    {
        foreach ($moduleSlugs as $slug) {
            if (! is_string($slug) || $slug === '') {
                continue;
            }

            $defaults = $meta[$slug] ?? [];
            $distribution = (string) ($defaults['distribution'] ?? 'bundled');
            if (! in_array($distribution, ['bundled', 'git'], true)) {
                $distribution = 'bundled';
            }

            $requiresLicense = array_key_exists('requires_license', $defaults)
                ? (bool) $defaults['requires_license']
                : ($slug !== 'core' && $distribution === 'git');

            DashboardModule::query()->firstOrCreate(
                ['slug' => $slug],
                [
                    'distribution' => $distribution,
                    'requires_license' => $requiresLicense,
                    'default_version' => '1.0.0',
                ]
            );
        }
    }

    /**
     * Enable + license tenant_modules and tenant_submodule_activations for the given parent slugs.
     *
     * @param  list<string>  $moduleSlugs
     */
    public function licenseModules(Tenant $tenant, array $moduleSlugs, bool $enabled = true): void
    {
        self::ensureDashboardModules($moduleSlugs);

        foreach ($moduleSlugs as $slug) {
            if (! is_string($slug) || $slug === '') {
                continue;
            }

            TenantModule::query()->updateOrCreate(
                ['tenant_id' => $tenant->id, 'module_slug' => $slug],
                ['enabled' => $enabled, 'licensed' => true, 'synced_at' => now()]
            );

            TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenant->id)
                ->where('module_slug', $slug)
                ->update(['licensed' => true, 'enabled' => $enabled]);
        }

        $this->clearCache($tenant->id);
    }

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
        $profileParents = array_keys($profile['modules']);

        // Guaranteed catalog parents for tenant_modules.module_slug FK (even if boot no-op'd).
        self::ensureDashboardModules($profileParents);

        DB::transaction(function () use ($tenant, $siteTypeSlug, $profile, $profileParents) {
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

            // Seed tenant_modules for every profile parent (and any already-known catalog modules).
            $allModules = DashboardModule::query()->pluck('slug')
                ->merge($profileParents)
                ->unique()
                ->values();

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
                // Parent must exist before tenant_modules FK; create if somehow missing.
                if (! $knownModules->has($activation->module_slug)) {
                    self::ensureDashboardModules([$activation->module_slug]);
                    $knownModules->put($activation->module_slug, true);
                }

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

            // Refresh after any catalog writes inside the loop; only write when FK parent exists.
            $knownModules = DashboardModule::query()->pluck('slug')->flip();
            if ($knownModules->has('core')) {
                TenantModule::query()->updateOrCreate(
                    ['tenant_id' => $tenant->id, 'module_slug' => 'core'],
                    ['enabled' => true, 'licensed' => true]
                );
            }

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
