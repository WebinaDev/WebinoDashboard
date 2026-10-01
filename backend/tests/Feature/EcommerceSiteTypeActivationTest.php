<?php

namespace Tests\Feature;

use App\Kernel\ModuleRegistry;
use App\Kernel\TenantActivationService;
use App\Models\DashboardModule;
use App\Models\SiteTypeActivation;
use App\Models\Submodule;
use App\Models\TenantModule;
use App\Models\TenantSubmoduleActivation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EcommerceSiteTypeActivationTest extends TestCase
{
    use RefreshDatabase;

    public function test_kernel_sync_persists_submodules_without_id_column(): void
    {
        app(ModuleRegistry::class)->boot();

        $this->assertDatabaseHas('dashboard_modules', ['slug' => 'commerce']);
        $this->assertTrue(
            Submodule::query()->where('module_slug', 'commerce')->where('slug', 'catalog')->exists()
        );
        $this->assertGreaterThan(
            0,
            SiteTypeActivation::query()->where('site_type_slug', 'ecommerce')->count()
        );
    }

    public function test_apply_site_type_ecommerce_creates_commerce_parent_and_licenses_shop(): void
    {
        // Simulate a sparse catalog like a failed kernel-sync left behind.
        DashboardModule::query()->firstOrCreate(
            ['slug' => 'core'],
            ['distribution' => 'bundled', 'requires_license' => false, 'default_version' => '1.0.0']
        );
        DashboardModule::query()->firstOrCreate(
            ['slug' => 'modules'],
            ['distribution' => 'bundled', 'requires_license' => false, 'default_version' => '1.0.0']
        );
        DashboardModule::query()->firstOrCreate(
            ['slug' => 'academy'],
            ['distribution' => 'git', 'requires_license' => true, 'default_version' => '1.0.0']
        );

        $this->assertFalse(
            DashboardModule::query()->where('slug', 'commerce')->exists()
        );

        $tenant = $this->createTenant([
            'setup_completed' => false,
            'business_type_slug' => null,
            'site_type_slug' => null,
        ]);

        app(TenantActivationService::class)->applySiteType($tenant, 'ecommerce');

        $this->assertDatabaseHas('dashboard_modules', ['slug' => 'commerce']);
        $this->assertDatabaseHas('tenant_modules', [
            'tenant_id' => $tenant->id,
            'module_slug' => 'commerce',
            'enabled' => 1,
            'licensed' => 1,
        ]);
        $this->assertTrue(
            TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenant->id)
                ->where('module_slug', 'commerce')
                ->where('submodule_slug', 'catalog')
                ->where('enabled', true)
                ->where('licensed', true)
                ->exists()
        );

        $tenant->refresh();
        $this->assertSame('ecommerce', $tenant->site_type_slug);
    }

    public function test_license_modules_sets_enabled_and_licensed_consistently(): void
    {
        $tenant = $this->createTenant();

        TenantActivationService::ensureDashboardModules(['commerce']);

        TenantSubmoduleActivation::query()->create([
            'tenant_id' => $tenant->id,
            'module_slug' => 'commerce',
            'submodule_slug' => 'catalog',
            'enabled' => false,
            'licensed' => false,
        ]);

        app(TenantActivationService::class)->licenseModules($tenant, ['commerce'], true);

        $this->assertDatabaseHas('tenant_modules', [
            'tenant_id' => $tenant->id,
            'module_slug' => 'commerce',
            'enabled' => 1,
            'licensed' => 1,
        ]);
        $this->assertDatabaseHas('tenant_submodule_activations', [
            'tenant_id' => $tenant->id,
            'module_slug' => 'commerce',
            'submodule_slug' => 'catalog',
            'enabled' => 1,
            'licensed' => 1,
        ]);
    }
}
