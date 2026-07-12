<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_gate_reports_unauthenticated_without_cookie(): void
    {
        $this->getJson('/api/v1/auth/gate')
            ->assertOk()
            ->assertJsonPath('data.authenticated', false)
            ->assertJsonPath('data.setup_completed', null);
    }

    public function test_gate_reports_authenticated_with_valid_cookie(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Gate Tenant',
            'slug' => 'gate-tenant',
            'domain' => 'localhost',
            'setup_completed' => false,
        ]);

        /** @var User $user */
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);

        $token = $user->createToken('spa')->plainTextToken;

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/auth/gate')
            ->assertOk()
            ->assertJsonPath('data.authenticated', true)
            ->assertJsonPath('data.setup_completed', false);

        $this->withCookie(config('auth.cookie_name', 'webino_auth_token'), $token)
            ->getJson('/api/v1/auth/gate')
            ->assertOk()
            ->assertJsonPath('data.authenticated', true);
    }

    public function test_setup_status_returns_401_without_auth(): void
    {
        $this->getJson('/api/v1/setup/status')->assertStatus(401);
    }
}
