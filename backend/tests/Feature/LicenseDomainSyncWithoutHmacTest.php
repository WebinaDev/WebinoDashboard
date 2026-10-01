<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LicenseDomainSyncWithoutHmacTest extends TestCase
{
    use RefreshDatabase;

    public function test_license_sync_works_without_hmac_secret(): void
    {
        config([
            'services.webino.base_url' => 'https://erp.test',
            'services.webino.license_hmac_secret' => '',
            'services.webino.product' => 'webinodashboard',
        ]);

        Http::fake([
            'erp.test/api/webinocrm/v1/license/check' => Http::response([
                'data' => [
                    'status' => 'active',
                    'valid' => true,
                    'active' => true,
                    'demo' => false,
                    'domain' => 'bluecafe.webinaagency.ir',
                    'product' => 'webinodashboard',
                    'licensed_modules' => [],
                ],
            ], 200),
        ]);

        $tenant = Tenant::query()->create([
            'name' => 'Bluecafe',
            'slug' => 'bluecafe',
            'domain' => 'bluecafe.webinaagency.ir',
            'setup_completed' => true,
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/license/sync')
            ->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.domain', 'bluecafe.webinaagency.ir')
            ->assertJsonPath('data.unreachable', false);

        $this->assertDatabaseHas('tenants', [
            'id' => $tenant->id,
            'license_status' => 'active',
            'license_unreachable' => false,
        ]);

        Http::assertSent(function ($request) {
            $data = $request->data();

            return str_contains($request->url(), '/api/webinocrm/v1/license/check')
                && ($data['domain'] ?? null) === 'bluecafe.webinaagency.ir'
                && ! array_key_exists('signature', $data);
        });
    }

    public function test_license_sync_soft_failure_updates_checked_at_and_returns_detail(): void
    {
        config([
            'services.webino.base_url' => 'https://erp.test',
            'services.webino.license_hmac_secret' => '',
            'services.webino.product' => 'webinodashboard',
        ]);

        Http::fake([
            'erp.test/api/webinocrm/v1/license/check' => Http::response(
                '<html>Upstream Error - Internal Server Error</html>',
                500,
                ['Content-Type' => 'text/html']
            ),
        ]);

        $tenant = Tenant::query()->create([
            'name' => 'Bluecafe',
            'slug' => 'bluecafe-soft',
            'domain' => 'bluecafe.webinaagency.ir',
            'setup_completed' => true,
            'license_checked_at' => now()->subDays(3),
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/license/sync')
            ->assertStatus(502)
            ->assertJsonPath('errors.code', 'LICENSE_UNREACHABLE');

        $detail = (string) $res->json('errors.detail');
        $this->assertNotSame('', $detail);
        $this->assertTrue(
            str_contains(strtolower($detail), 'erp') || str_contains($detail, 'لایسنس') || str_contains(strtolower($detail), 'upstream') || str_contains(strtolower($detail), 'http'),
            'detail should surface ERP/HTTP reason, got: '.$detail
        );

        $tenant->refresh();
        $this->assertTrue((bool) $tenant->license_unreachable);
        $this->assertNotNull($tenant->license_checked_at);
        $this->assertTrue($tenant->license_checked_at->greaterThan(now()->subMinute()));
    }
}
