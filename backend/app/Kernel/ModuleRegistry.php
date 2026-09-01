<?php

namespace App\Kernel;

use App\Models\DashboardModule;
use App\Models\SiteType;
use App\Models\SiteTypeActivation;
use App\Models\Submodule;
use Illuminate\Support\Facades\Cache;

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
                    'requires_license' => false,
                    'default_version' => '1.0.0',
                ]
            );

            foreach ($manifest->submodules as $index => $subSlug) {
                Submodule::query()->updateOrCreate(
                    [
                        'module_slug' => $manifest->slug,
                        'slug' => $subSlug,
                    ],
                    [
                        'name_fa' => $subSlug,
                        'name_en' => $subSlug,
                        'is_core' => $manifest->slug === 'core',
                        'sort_order' => $index,
                        'admin_nav' => $manifest->adminNav,
                        'public_routes' => $manifest->publicRoutes,
                    ]
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

    public function boot(): void
    {
        $this->syncCatalog();
        $this->syncSiteTypes();
        Cache::forget('kernel:site_types');
        Cache::forget('kernel:registry');
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
