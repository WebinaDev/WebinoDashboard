<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardUpdatePipelineApiTest extends TestCase
{
    use RefreshDatabase;

    private function staffUser(): User
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 'update-pipeline',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);

        return User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);
    }

    public function test_update_status_when_self_update_disabled(): void
    {
        config(['dashboard.self_update' => false, 'dashboard.version' => '1.0.0']);

        Sanctum::actingAs($this->staffUser());

        $this->getJson('/api/v1/updates/status')
            ->assertOk()
            ->assertJsonPath('data.self_update_enabled', false)
            ->assertJsonPath('data.version', '1.0.0');
    }

    public function test_apply_returns_422_when_self_update_disabled(): void
    {
        config(['dashboard.self_update' => false]);

        Sanctum::actingAs($this->staffUser());

        $this->postJson('/api/v1/updates/apply')
            ->assertStatus(422)
            ->assertJsonPath('errors.code', 'SELF_UPDATE_DISABLED');
    }

    public function test_build_pipeline_status_disabled_when_flag_off(): void
    {
        config(['dashboard.build_pipeline' => false]);

        Sanctum::actingAs($this->staffUser());

        $this->getJson('/api/v1/build-pipeline/status')
            ->assertOk()
            ->assertJsonPath('data.enabled', false)
            ->assertJsonPath('data.status', 'disabled');
    }

    public function test_build_pipeline_start_returns_422_when_flag_off(): void
    {
        config(['dashboard.build_pipeline' => false]);

        Sanctum::actingAs($this->staffUser());

        $this->postJson('/api/v1/build-pipeline/start')
            ->assertStatus(422)
            ->assertJsonPath('errors.code', 'BUILD_PIPELINE_DISABLED');
    }
}
