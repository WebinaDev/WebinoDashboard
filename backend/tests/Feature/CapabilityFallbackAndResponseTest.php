<?php

namespace Tests\Feature;

use App\Http\Middleware\ApiResponseFormatter;
use App\Models\RoleCapability;
use App\Support\CapabilityChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CapabilityFallbackAndResponseTest extends TestCase
{
    use RefreshDatabase;

    public function test_global_capabilities_apply_only_when_no_tenant_role_override_exists(): void
    {
        $first = $this->createTenant();
        $second = $this->createTenant();
        RoleCapability::query()->create(['role' => 'test_role', 'capability' => 'pos.use']);
        RoleCapability::query()->create(['tenant_id' => $first->id, 'role' => 'test_role', 'capability' => 'reports.shop']);

        $checker = app(CapabilityChecker::class);
        $this->assertSame(['reports.shop'], $checker->capabilitiesForRole('test_role', $first->id));
        $this->assertSame(['pos.use'], $checker->capabilitiesForRole('test_role', $second->id));
    }

    public function test_null_data_remains_null_in_api_envelope(): void
    {
        $request = Request::create('/api/v1/test', 'GET', server: ['HTTP_ACCEPT' => 'application/json']);
        $response = app(ApiResponseFormatter::class)->handle($request, fn () => response()->json(['data' => null]));

        $this->assertNull($response->getData(true)['data']);
    }

    public function test_accounting_migration_keeps_existing_choices_and_does_not_grant_new_licenses(): void
    {
        DB::table('dashboard_modules')->insert(['slug' => 'commerce']);
        $existing = $this->createTenant(['site_type_slug' => 'cafe']);
        $new = $this->createTenant(['site_type_slug' => 'cafe']);
        DB::table('tenant_submodule_activations')->insert([
            'tenant_id' => $existing->id,
            'module_slug' => 'commerce',
            'submodule_slug' => 'accounting',
            'enabled' => false,
            'licensed' => true,
        ]);

        $migration = require database_path('migrations/2026_11_23_120000_enable_accounting_for_commerce_tenants.php');
        $migration->up();
        $migration->up();

        $this->assertDatabaseHas('tenant_submodule_activations', [
            'tenant_id' => $existing->id, 'module_slug' => 'commerce', 'submodule_slug' => 'accounting',
            'enabled' => false, 'licensed' => true,
        ]);
        $this->assertDatabaseHas('tenant_submodule_activations', [
            'tenant_id' => $new->id, 'module_slug' => 'commerce', 'submodule_slug' => 'accounting',
            'enabled' => false, 'licensed' => false,
        ]);
        $this->assertSame(2, DB::table('tenant_submodule_activations')->where('module_slug', 'commerce')->where('submodule_slug', 'accounting')->count());
    }
}
