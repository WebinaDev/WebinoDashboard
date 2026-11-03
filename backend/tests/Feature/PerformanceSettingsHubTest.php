<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PerformanceSettingsHubTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop-perf',
            'domain' => 'shop-perf.test',
            'license_key' => 'k-perf',
            'provision_token' => 'site-token-perf',
            'setup_completed' => true,
            'default_currency' => 'IRT',
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($this->user, 'sanctum');
    }

    public function test_performance_hub_settings_insights_and_purge(): void
    {
        $this->putJson('/api/v1/performance/settings', [
            'enabled' => true,
            'preset' => 'recommended',
            'webp_enabled' => true,
            'lazy_load' => true,
            'critical_css' => true,
            'page_cache_enabled' => true,
            'cdn_provider' => 'arvan',
            'cdn_zone' => 'example.ir',
            'isr_revalidate_seconds' => 120,
            'image_quality' => 80,
        ])->assertOk()
            ->assertJsonPath('data.isr_revalidate_seconds', 120)
            ->assertJsonPath('data.critical_css', true)
            ->assertJsonPath('data.cdn_provider', 'arvan')
            ->assertJsonPath('data.cdn_zone', 'example.ir');

        $this->getJson('/api/v1/performance/settings')
            ->assertOk()
            ->assertJsonPath('data.page_cache_enabled', true);

        $insights = $this->getJson('/api/v1/performance/insights')
            ->assertOk()
            ->assertJsonStructure(['data' => ['score', 'structure', 'grade', 'checklist', 'actions', 'db_tips']])
            ->json('data');
        $this->assertIsInt($insights['score']);
        $this->assertNotSame('', (string) $insights['grade']);

        $this->postJson('/api/v1/performance/purge', ['reason' => 'hub-test'])
            ->assertOk()
            ->assertJsonPath('data.ok', true);
    }

    public function test_performance_preset_aggressive_enables_speed_flags(): void
    {
        $data = $this->putJson('/api/v1/performance/settings', [
            'preset' => 'aggressive',
        ])->assertOk()->json('data');

        $this->assertTrue((bool) $data['critical_css']);
        $this->assertTrue((bool) $data['delay_js']);
        $this->assertTrue((bool) $data['avif_enabled']);
        $this->assertTrue((bool) $data['page_cache_enabled']);
    }
}
