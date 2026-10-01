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
}
