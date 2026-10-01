<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Security\LoginAttemptService;
use App\Services\Security\SecuritySettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecuritySettingsEnforcementTest extends TestCase
{
    use RefreshDatabase;

    public function test_security_settings_save_replaces_legacy_wp_keys(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Sec',
            'slug' => 'sec-tenant',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($user);

        $res = $this->putJson('/api/v1/settings/site/security', [
            'payload' => [
                'privacy' => [
                    'hide_app_fingerprint' => true,
                    'disable_dangerous_debug' => true,
                ],
                'login' => [
                    'limit_attempts' => true,
                    'max_attempts' => 3,
                    'lockout_minutes' => 10,
                    'force_2fa_admins' => true,
                ],
                'waf' => ['enabled' => true, 'enforce' => false],
                'general' => ['enabled' => true, 'profile' => 'store'],
            ],
        ]);

        $res->assertOk();
        $data = $res->json('data');
        $this->assertTrue($data['privacy']['hide_app_fingerprint']);
        $this->assertArrayNotHasKey('hide_wp_version', $data['privacy']);
        $this->assertSame(3, $data['login']['max_attempts']);
        $this->assertTrue($data['login']['force_2fa_admins']);
    }

    public function test_login_lockout_after_max_attempts(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Lock',
            'slug' => 'lock-tenant',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);
        User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'admin@example.com',
            'password' => Hash::make('secret-pass'),
            'role' => 'admin',
            'is_active' => true,
        ]);

        SecuritySettings::save((int) $tenant->id, [
            'general' => ['enabled' => true, 'profile' => 'recommended'],
            'login' => [
                'limit_attempts' => true,
                'max_attempts' => 2,
                'lockout_minutes' => 15,
            ],
        ]);

        // Force tenant resolution via domain header if supported; otherwise LoginAttemptService
        // is exercised directly when tenant is null on host. Seed attempts manually then assert.
        $attempts = app(LoginAttemptService::class);
        $attempts->recordFailure((int) $tenant->id, 'admin@example.com', '127.0.0.1');
        $attempts->recordFailure((int) $tenant->id, 'admin@example.com', '127.0.0.1');
        $this->assertTrue($attempts->isLocked((int) $tenant->id, 'admin@example.com', '127.0.0.1'));
    }

    public function test_shop_payments_settings_proxy_hub(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Pay',
            'slug' => 'pay-tenant',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($user);

        $res = $this->getJson('/api/v1/settings/shop/payments');
        $res->assertOk();
        $this->assertSame('payments.hub', $res->json('data._source'));
        $this->assertIsArray($res->json('data.enabled'));
        $this->assertArrayHasKey('colors', $res->json('data.geo_notice'));
    }

    public function test_site_sms_uses_otp_settings_defaults(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Sms',
            'slug' => 'sms-tenant',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($user);

        $res = $this->getJson('/api/v1/settings/site/sms');
        $res->assertOk();
        $this->assertSame(5, $res->json('data.otp_max_attempts'));
        $this->assertArrayHasKey('otp_channels', $res->json('data'));
    }
}
