<?php

namespace Tests\Feature;

use App\Models\SecurityEvent;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Security\SecuritySettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SecurityGeoForensicsTest extends TestCase
{
    use RefreshDatabase;

    private function tenant(): Tenant
    {
        return Tenant::query()->create(['name' => 'Sec', 'slug' => 'sec-shop', 'domain' => 'sec.test', 'license_key' => 'l-sec', 'setup_completed' => true]);
    }

    public function test_geo_block_uses_edge_header_and_logs_event(): void
    {
        $t = $this->tenant();
        SecuritySettings::save($t->id, ['geo' => ['enabled' => true, 'mode' => 'allow', 'countries' => 'IR']]);

        $this->withHeaders(['Host' => 'sec.test', 'CF-IPCountry' => 'US'])->getJson('http://sec.test/api/v1/public/tenant')
            ->assertStatus(403)->assertJsonPath('errors.code', 'GEO_BLOCKED');
        $this->assertDatabaseHas('security_events', ['tenant_id' => $t->id, 'type' => 'geo_block', 'country' => 'US']);

        $this->withHeaders(['Host' => 'sec.test', 'CF-IPCountry' => 'IR'])->getJson('http://sec.test/api/v1/public/tenant')
            ->assertStatus(200);
        // No header → never blocked.
        $this->getJson('http://sec.test/api/v1/public/tenant')->assertStatus(200);
    }

    public function test_settings_sanitize_and_events_api(): void
    {
        $t = $this->tenant();
        $s = SecuritySettings::save($t->id, ['geo' => ['countries' => ['us', 'bad!', 'DE']], 'rate' => ['checkout_per_min' => 9999]]);
        $this->assertSame(['US', 'DE'], $s['geo']['countries']);
        $this->assertSame(600, $s['rate']['checkout_per_min']);

        SecurityEvent::query()->create(['tenant_id' => $t->id, 'type' => 'waf_hit', 'ip' => '1.2.3.4', 'created_at' => now()]);
        $admin = User::factory()->create(['tenant_id' => $t->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $this->getJson('/api/v1/security/events')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/security/events/summary')->assertOk()->assertJsonPath('data.by_type.waf_hit', 1);
    }
}
