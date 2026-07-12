<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProvisionBootstrapTest extends TestCase
{
    use RefreshDatabase;

    public function test_provision_bootstrap_applies_seed_with_token(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Demo',
            'slug' => 'demo',
            'setup_completed' => false,
        ]);

        User::query()->create([
            'name' => 'Admin',
            'email' => 'admin@example.com',
            'password' => Hash::make('password'),
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);

        putenv('TENANT_PROVISION_TOKEN=test-token-123');
        $_ENV['TENANT_PROVISION_TOKEN'] = 'test-token-123';

        $seed = [
            'tenant_name' => 'Cafe Demo',
            'store_display_name' => 'My Cafe',
            'default_currency' => 'IRR',
            'domain' => 'cafe.example.com',
            'license_key' => 'wb-test',
            'business_type_slug' => 'cafe',
            'vertical' => 'cafe',
            'package_sku' => 'pkg-cafe-starter',
            'theme_preset' => 'cafe',
            'admin_email' => 'owner@cafe.example.com',
            'admin_name' => 'Owner',
        ];

        $body = json_encode(['seed' => $seed], JSON_THROW_ON_ERROR);

        $this->withHeaders([
            'X-Provision-Token' => 'test-token-123',
            'Content-Type' => 'application/json',
        ])
            ->call('POST', '/api/v1/provision/bootstrap', [], [], [], [], $body)
            ->assertOk()
            ->assertJsonPath('data.ok', true);

        $tenant->refresh();
        $this->assertSame('Cafe Demo', $tenant->name);
        $this->assertSame('cafe', $tenant->business_type_slug);
        $this->assertSame('pkg-cafe-starter', $tenant->package_sku);
        $this->assertFalse($tenant->setup_completed);
    }

    public function test_provision_bootstrap_rejects_invalid_token(): void
    {
        putenv('TENANT_PROVISION_TOKEN=expected');
        $_ENV['TENANT_PROVISION_TOKEN'] = 'expected';

        $this->postJson('/api/v1/provision/bootstrap', [
            'seed' => ['tenant_name' => 'X'],
        ], ['X-Provision-Token' => 'wrong'])
            ->assertForbidden();
    }
}
