<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlatformVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_verification_code_is_validated_and_isolated_by_site(): void
    {
        $first = $this->site('site-001');
        $second = $this->site('site-002');
        $this->actingAs(User::factory()->create(['tenant_id' => $first->id, 'role' => 'admin']), 'sanctum');

        $this->putJson('/api/v1/settings/site/general', ['payload' => ['samandehi_verification' => 'sample_code_001']])
            ->assertOk()->assertJsonPath('data.samandehi_verification', 'sample_code_001');
        $this->getJson('/api/v1/settings/site/general')->assertOk()->assertJsonPath('data.samandehi_verification', 'sample_code_001');
        $this->withHeader('X-Tenant-Domain', 'site-001.example.local')->getJson('/api/v1/public/platform-verification')
            ->assertOk()->assertJsonPath('data.code', 'sample_code_001')->assertHeader('Cache-Control', 'no-store, private');
        $this->withHeader('X-Tenant-Domain', 'site-002.example.local')->getJson('/api/v1/public/platform-verification')
            ->assertOk()->assertJsonPath('data.code', '');
        $this->withHeader('X-Tenant-Domain', 'unknown.example.local')->getJson('/api/v1/public/platform-verification')
            ->assertNotFound();

        $this->putJson('/api/v1/settings/site/general', ['payload' => ['samandehi_verification' => "bad\ncode"]])
            ->assertUnprocessable();
        $this->putJson('/api/v1/settings/site/general', ['payload' => ['site_title' => 'Site']])
            ->assertOk()->assertJsonPath('data.samandehi_verification', 'sample_code_001');
        $this->putJson('/api/v1/settings/site/general', ['payload' => ['samandehi_verification' => '']])
            ->assertOk()->assertJsonPath('data.samandehi_verification', '');
        $this->withHeader('X-Tenant-Domain', 'site-001.example.local')->getJson('/api/v1/public/platform-verification')
            ->assertOk()->assertJsonPath('data.code', '');
    }

    private function site(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => $slug,
            'slug' => $slug,
            'domain' => $slug.'.example.local',
            'license_key' => $slug,
            'provision_token' => $slug,
            'setup_completed' => true,
            'default_currency' => 'IRT',
        ]);
    }
}
