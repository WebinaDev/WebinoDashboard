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
        $legacyMap = [
            'dashboard' => ['core', 'dashboard'],
            'modules' => ['core', 'modules'],
            'catalog' => ['commerce', 'catalog'],
            'cart' => ['commerce', 'cart'],
            'checkout' => ['commerce', 'checkout'],
            'orders' => ['commerce', 'orders'],
            'inventory' => ['commerce', 'inventory'],
            'analytics' => ['analytics', 'overview'],
            'rbac' => ['users', 'rbac'],
            'reports' => ['analytics', 'reports'],
            'marketing' => ['marketing', 'campaigns'],
            'cms' => ['cms', 'pages'],
            'blog' => ['blog', 'posts'],
            'academy' => ['academy', 'courses'],
            'portfolio' => ['corporate', 'portfolio'],
            'announcements' => ['corporate', 'announcements'],
            'testimonials' => ['corporate', 'testimonials'],
            'team' => ['corporate', 'team'],
            'consultations' => ['corporate', 'consultations'],
        ];

        foreach ($legacyMap as $legacySlug => [$module, $sub]) {
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
