<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SiteStatusTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create(['name' => 'S', 'slug' => 's', 'domain' => 'localhost', 'setup_completed' => true]);
        putenv('TENANT_PROVISION_TOKEN=tok-1');
        $_ENV['TENANT_PROVISION_TOKEN'] = $_SERVER['TENANT_PROVISION_TOKEN'] = 'tok-1';
        config(['services.webino.provision_hmac_secret' => 'sec']);
    }

    private function platform(string $method, array $body = [], string $token = 'tok-1')
    {
        $raw = $body ? json_encode($body) : '';

        return $this->call($method, '/api/v1/provision/site-status', [], [], [], [
            'HTTP_X-Provision-Token' => $token,
            'HTTP_X-Provision-Signature' => hash_hmac('sha256', $raw, 'sec'),
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
        ], $raw);
    }

    private function admin(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin', 'is_active' => true]));
    }

    public function test_default_is_active_and_public_exposed(): void
    {
        $this->getJson('/api/v1/public/site-status')->assertOk()->assertJsonPath('data.status', 'active');
        $this->platform('GET')->assertOk()->assertJsonPath('data.status', 'active');
    }

    public function test_platform_requires_token(): void
    {
        $this->platform('PUT', ['status' => 'suspended'], 'bad')->assertStatus(403);
    }

    public function test_platform_suspends_and_admin_cannot_clear(): void
    {
        $this->platform('PUT', ['status' => 'suspended', 'reason' => 'license', 'expires_at' => '2026-10-01T00:00:00Z'])
            ->assertOk()->assertJsonPath('data.status', 'suspended')->assertJsonPath('data.updated_by', 'platform')
            ->assertJsonStructure(['data' => ['status', 'reason', 'expires_at', 'launch_at', 'updated_at', 'updated_by']]);
        $this->getJson('/api/v1/public/tenant')->assertJsonPath('data.site_status.status', 'suspended');
        $this->admin();
        $this->putJson('/api/v1/site-status', ['status' => 'active'])->assertStatus(423);
        $this->platform('PUT', ['status' => 'active'])->assertJsonPath('data.status', 'active');
    }

    public function test_admin_toggles_coming_soon_only(): void
    {
        $this->admin();
        $this->putJson('/api/v1/site-status', ['status' => 'suspended'])->assertStatus(422);
        $this->putJson('/api/v1/site-status', ['status' => 'coming_soon', 'launch_at' => '2026-12-01T10:00:00+03:30'])
            ->assertOk()->assertJsonPath('data.status', 'coming_soon')->assertJsonPath('data.updated_by', 'admin');
        $this->platform('GET')->assertJsonPath('data.status', 'coming_soon')->assertJsonPath('data.updated_by', 'admin');
        $this->putJson('/api/v1/site-status', ['status' => 'active'])->assertOk()->assertJsonPath('data.status', 'active');
    }

    public function test_guest_cannot_use_admin_endpoint(): void
    {
        $this->putJson('/api/v1/site-status', ['status' => 'coming_soon'])->assertStatus(401);
    }
}
