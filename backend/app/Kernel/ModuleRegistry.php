<?php

namespace App\Kernel;

use App\Models\DashboardModule;
use App\Models\SiteType;
use App\Models\SiteTypeActivation;
use App\Models\Submodule;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class ModuleRegistry
{
    public function __construct(
        private readonly ModuleDiscovery $discovery,
    ) {}

    public function syncCatalog(): void
    {
        foreach ($this->discovery->discover() as $manifest) {
            DashboardModule::query()->updateOrCreate(
                ['slug' => $manifest->slug],
                [
                    'distribution' => $manifest->distribution,
                    'requires_license' => $manifest->requiresLicense(),
                    'default_version' => '1.0.0',
                ]
            );

            foreach ($manifest->submodules as $index => $subSlug) {
                // Upsert avoids Eloquent insertAndSetId / RETURNING "id" on Postgres
                // (submodules has composite PK, no id column).
                DB::table('submodules')->upsert(
                    [[
                        'module_slug' => $manifest->slug,
                        'slug' => $subSlug,
                        'name_fa' => $subSlug,
                        'name_en' => $subSlug,
                        'is_core' => $manifest->slug === 'core',
                        'sort_order' => $index,
                        'admin_nav' => $manifest->adminNav !== null ? json_encode($manifest->adminNav) : null,
                        'public_routes' => json_encode($manifest->publicRoutes),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]],
                    ['module_slug', 'slug'],
                    ['name_fa', 'name_en', 'is_core', 'sort_order', 'admin_nav', 'public_routes', 'updated_at']
                );
            }
        }
    }

    public function syncSiteTypes(): void
    {
        foreach (SiteTypeProfiles::all() as $slug => $profile) {
            SiteType::query()->updateOrCreate(
                ['slug' => $slug],
                [
                    'name_fa' => $profile['name_fa'],
                    'name_en' => $profile['name_en'],
                    'default_theme_slug' => $profile['theme'],
                    'sort_order' => array_search($slug, SiteTypeProfiles::TYPES, true) ?: 0,
                ]
            );

            // Ensure every parent module slug from the profile exists before activations.
            TenantActivationService::ensureDashboardModules(array_keys($profile['modules']));

            SiteTypeActivation::query()->where('site_type_slug', $slug)->delete();

            foreach ($profile['modules'] as $moduleSlug => $submodules) {
                foreach ($submodules as $subSlug) {
                    SiteTypeActivation::query()->create([
                        'site_type_slug' => $slug,
                        'module_slug' => $moduleSlug,
                        'submodule_slug' => $subSlug,
                        'enabled_by_default' => true,
                    ]);
                }
            }
        }
    }

    /**
     * Per-request entry point (KernelServiceProvider). The catalog/site-type sync is ~400
     * upserts and used to run on every HTTP request (~0.4s TTFB on every tenant API call).
     * Only sync when the module manifests or site-type profiles changed; re-check daily.
     */
    public function bootIfChanged(): void
    {
        $fingerprint = $this->catalogFingerprint();
        if (Cache::get(self::FINGERPRINT_KEY) === $fingerprint) {
            return;
        }

        Cache::lock(self::FINGERPRINT_KEY.':lock', 30)->get(function () use ($fingerprint) {
            if (Cache::get(self::FINGERPRINT_KEY) !== $fingerprint) {
                $this->boot();
            }
        });
    }

    public const FINGERPRINT_KEY = 'kernel:catalog_fp';

    public function catalogFingerprint(): string
    {
        return sha1(serialize([$this->discovery->discover(), SiteTypeProfiles::all()]));
    }

    public function boot(): void
    {
        $this->syncCatalog();
        $this->syncSiteTypes();
        Cache::forget('kernel:site_types');
        Cache::forget('kernel:registry');
        Cache::put(self::FINGERPRINT_KEY, $this->catalogFingerprint(), now()->addDay());
    }

    /** @return array<string, mixed> */
    public function registryPayload(): array
    {
        return Cache::remember('kernel:registry', 300, function () {
            $modules = [];
            foreach ($this->discovery->keyed() as $slug => $manifest) {
                $subs = Submodule::query()
                    ->where('module_slug', $slug)
                    ->orderBy('sort_order')
                    ->get()
                    ->map(fn ($s) => [
                        'slug' => $s->slug,
                        'name_fa' => $s->name_fa,
                        'name_en' => $s->name_en,
                        'is_core' => $s->is_core,
                        'admin_nav' => $s->admin_nav,
                        'public_routes' => $s->public_routes,
                    ])
                    ->values()
                    ->all();

                $modules[] = [
                    'slug' => $manifest->slug,
                    'name_fa' => $manifest->nameFa,
                    'name_en' => $manifest->nameEn,
                    'distribution' => $manifest->distribution,
                    'requires_license' => $manifest->requiresLicense(),
                    'site_types' => $manifest->siteTypes,
                    'admin_nav' => $manifest->adminNav,
                    'public_routes' => $manifest->publicRoutes,
                    'submodules' => $subs,
                ];
            }

            $siteTypes = SiteType::query()
                ->orderBy('sort_order')
                ->get()
                ->map(fn (SiteType $st) => [
                    'slug' => $st->slug,
                    'name_fa' => $st->name_fa,
                    'name_en' => $st->name_en,
                    'default_theme_slug' => $st->default_theme_slug,
                ])
                ->values()
                ->all();

            return [
                'modules' => $modules,
                'site_types' => $siteTypes,
            ];
        });
    }
}
