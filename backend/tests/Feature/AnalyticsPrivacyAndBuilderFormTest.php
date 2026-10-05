<?php

namespace Tests\Feature;

use App\Models\BuilderFormSubmission;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Analytics\AnalyticsSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsPrivacyAndBuilderFormTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant([
            'slug' => 'parity-forms',
            'domain' => 'parity-forms.test',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'analytics.overview' => true,
            'analytics.reports' => true,
        ]);
        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
    }

    public function test_analytics_settings_persist_bypass_and_geoip(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->putJson('/api/v1/settings/site/analytics', [
                'payload' => [
                    'tracking_enabled' => true,
                    'anonymize_ip' => true,
                    'bypass_adblocker' => true,
                    'geoip_path' => '/var/lib/GeoLite2-Country.mmdb',
                ],
            ])
            ->assertOk();

        $settings = AnalyticsSettings::get((int) $this->tenant->id);
        $this->assertTrue((bool) $settings['bypass_adblocker']);
        $this->assertSame('/var/lib/GeoLite2-Country.mmdb', $settings['geoip_path']);

        $boot = $this->withHeader('X-Tenant-Domain', 'parity-forms.test')
            ->getJson('/api/v1/public/analytics/bootstrap')
            ->assertOk()
            ->json('data');
        $this->assertTrue((bool) ($boot['bypass_adblocker'] ?? false));
        $this->assertStringContainsString('/api/v1/public/metrics/collect', (string) ($boot['endpoint'] ?? ''));
    }

    public function test_public_builder_form_submit_stores_payload(): void
    {
        $this->withHeader('X-Tenant-Domain', 'parity-forms.test')
            ->postJson('/api/v1/public/forms/submit', [
                'form_key' => 'contact',
                'page_uri' => '/contact',
                'fields' => [
                    'name' => 'Arsalan',
                    'message' => 'Hello from parity test',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.ok', true);

        $row = BuilderFormSubmission::query()->where('tenant_id', $this->tenant->id)->first();
        $this->assertNotNull($row);
        $this->assertSame('Arsalan', $row->payload['name'] ?? null);
        $this->assertSame('Hello from parity test', $row->payload['message'] ?? null);
    }
}
