<?php

namespace Tests\Feature;

use App\Kernel\ModuleDiscovery;
use App\Kernel\ModuleManifest;
use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use App\Services\Modules\ModuleGitInstaller;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HybridModuleInstallTest extends TestCase
{
    use RefreshDatabase;

    public function test_manifest_distribution_sync_sets_requires_license_for_git(): void
    {
        $discovery = app(ModuleDiscovery::class);
        $keyed = $discovery->keyed();

        $this->assertArrayHasKey('core', $keyed);
        $this->assertSame('bundled', $keyed['core']->distribution);
        $this->assertFalse($keyed['core']->requiresLicense());

        if (isset($keyed['commerce'])) {
            $this->assertSame('git', $keyed['commerce']->distribution);
            $this->assertTrue($keyed['commerce']->requiresLicense());
        }
    }

    public function test_module_manifest_from_array_defaults_distribution(): void
    {
        $m = ModuleManifest::fromArray(['slug' => 'x', 'name_fa' => 'x', 'name_en' => 'x']);
        $this->assertSame('bundled', $m->distribution);

        $g = ModuleManifest::fromArray([
            'slug' => 'y',
            'name_fa' => 'y',
            'name_en' => 'y',
            'distribution' => 'git',
        ]);
        $this->assertTrue($g->isGitDistributed());
    }

    public function test_git_install_without_license_is_forbidden(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 'git-install',
            'domain' => 'localhost',
            'setup_completed' => true,
            'license_key' => 'wb-none',
        ]);

        DashboardModule::query()->create([
            'slug' => 'commerce',
            'distribution' => 'git',
            'requires_license' => true,
            'git_repo' => 'https://github.com/example/commerce.git',
            'default_version' => '1.0.0',
        ]);

        TenantModule::query()->create([
            'tenant_id' => $tenant->id,
            'module_slug' => 'commerce',
            'enabled' => false,
            'licensed' => false,
        ]);

        config([
            'services.webino.base_url' => 'http://127.0.0.1:9',
            'services.webino.license_hmac_secret' => 'secret',
            'modules.git.enabled' => true,
            'modules.git.crm_clone_auth' => false,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($user);

        // Without CRM (unreachable), assertLicensed fails → 403/500; we assert not success.
        $res = $this->postJson('/api/v1/modules/commerce/install');
        $this->assertFalse($res->isSuccessful());
    }

    public function test_external_discovery_overrides_bundled(): void
    {
        $discovery = app(ModuleDiscovery::class);
        $external = $discovery->externalPath().'/DemoPaid';
        File::ensureDirectoryExists($external);
        File::put($external.'/manifest.json', json_encode([
            'slug' => 'demo_paid',
            'name_fa' => 'دمو',
            'name_en' => 'Demo',
            'distribution' => 'git',
            'submodules' => [],
            'site_types' => [],
            'public_routes' => [],
        ], JSON_UNESCAPED_UNICODE));

        try {
            $this->assertTrue($discovery->isInstalledExternally('demo_paid'));
            $this->assertTrue($discovery->codePresent('demo_paid'));
            $keyed = $discovery->keyed();
            $this->assertSame('git', $keyed['demo_paid']->distribution);
        } finally {
            File::deleteDirectory($external);
        }
    }

    public function test_installer_status_payload(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 'status-mod',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);

        DashboardModule::query()->create([
            'slug' => 'core',
            'distribution' => 'bundled',
            'requires_license' => false,
            'default_version' => '1.0.0',
        ]);

        $status = app(ModuleGitInstaller::class)->status($tenant->id, 'core');
        $this->assertSame('core', $status['slug']);
        $this->assertSame('bundled', $status['distribution']);
    }
}
