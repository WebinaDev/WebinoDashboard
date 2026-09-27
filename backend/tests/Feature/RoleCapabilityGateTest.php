<?php

namespace Tests\Feature;

use App\Http\Middleware\ThrottleApiToken;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Tests\TestCase;

class RoleCapabilityGateTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'RBAC',
            'slug' => 'rbac-gate',
            'domain' => 'rbac.test',
            'setup_completed' => true,
        ]);
    }

    public function test_seller_gets_403_on_accounting_and_200_on_pos(): void
    {
        $this->withoutMiddleware([ThrottleApiToken::class, ThrottleRequests::class]);
        $seller = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'seller']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.accounting' => true,
            'commerce.pos' => true,
        ]);
        $this->actingAs($seller, 'sanctum');

        $this->getJson('/api/v1/accounting/status')
            ->assertForbidden()
            ->assertJsonPath('errors.code', 'CAPABILITY_DENIED');

        $this->getJson('/api/v1/pos/customers')
            ->assertOk();
    }

    public function test_customer_still_gets_staff_only_on_staff_routes(): void
    {
        $this->withoutMiddleware([ThrottleApiToken::class, ThrottleRequests::class]);
        $customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $this->actingAs($customer, 'sanctum');

        $this->getJson('/api/v1/shop/tickets')
            ->assertForbidden()
            ->assertJsonPath('errors.code', 'STAFF_ONLY');
    }

    public function test_auth_user_includes_capabilities(): void
    {
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/auth/user')
            ->assertOk()
            ->assertJsonPath('data.capabilities', ['*']);

        $seller = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'seller']);
        $this->actingAs($seller, 'sanctum');

        $this->getJson('/api/v1/auth/user')
            ->assertOk()
            ->assertJsonFragment(['pos.use'])
            ->assertJsonFragment(['orders.own']);
    }
}
