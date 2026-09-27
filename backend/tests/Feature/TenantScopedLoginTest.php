<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Tests\TestCase;

class TenantScopedLoginTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenantA;

    protected Tenant $tenantB;

    protected User $userA;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);

        $this->tenantA = Tenant::query()->create(['name' => 'A', 'slug' => 'tenant-a', 'domain' => 'a.test', 'setup_completed' => true]);
        $this->tenantB = Tenant::query()->create(['name' => 'B', 'slug' => 'tenant-b', 'domain' => 'b.test', 'setup_completed' => true]);
        $this->userA = User::factory()->create([
            'tenant_id' => $this->tenantA->id,
            'email' => 'owner@a.test',
            'password' => 'secret-pass',
        ]);
    }

    private function credentials(): array
    {
        return ['email' => 'owner@a.test', 'password' => 'secret-pass'];
    }

    public function test_user_cannot_log_in_through_another_tenants_domain(): void
    {
        $this->withHeader('X-Tenant-Domain', 'b.test')
            ->postJson('/api/v1/auth/login', $this->credentials())
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');

        $this->postJson('http://b.test/api/v1/auth/login', $this->credentials())
            ->assertStatus(422);

        $this->postJson('/api/v1/auth/session?tenant_domain=www.b.test', $this->credentials())
            ->assertStatus(422);
    }

    public function test_user_logs_in_through_own_tenant_domain(): void
    {
        $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/login', $this->credentials())
            ->assertOk();

        $this->postJson('http://www.a.test/api/v1/auth/login', $this->credentials())
            ->assertOk();
    }

    public function test_internal_host_without_tenant_hint_keeps_global_lookup(): void
    {
        $this->postJson('/api/v1/auth/login', $this->credentials())->assertOk();

        $this->withHeader('X-Tenant-Domain', 'unknown.test')
            ->postJson('/api/v1/auth/login', $this->credentials())
            ->assertOk();
    }

    public function test_email_stays_globally_unique(): void
    {
        $this->expectException(QueryException::class);

        User::factory()->create(['tenant_id' => $this->tenantB->id, 'email' => 'owner@a.test']);
    }
}
