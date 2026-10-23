<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomersApiTest extends TestCase
{
    use RefreshDatabase;

    protected function adminFor(Tenant $tenant): User
    {
        return User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
    }

    public function test_customers_index_returns_envelope_list(): void
    {
        $tenant = $this->createTenant();
        $admin = $this->adminFor($tenant);
        User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'customer',
            'name' => 'Buyer One',
            'email' => 'buyer@example.test',
        ]);

        $this->enableSubmodule($tenant->id, 'users', 'customers');
        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/customers')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta']);
    }

    public function test_customer_profile_returns_stats_and_is_tenant_scoped(): void
    {
        $tenant = $this->createTenant();
        $admin = $this->adminFor($tenant);
        $buyer = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'customer', 'phone' => '09120000000']);
        \App\Models\Order::query()->create(['tenant_id' => $tenant->id, 'user_id' => $buyer->id, 'number' => 'A-1', 'status' => 'paid', 'total_minor' => 1000, 'subtotal_minor' => 1000, 'currency' => 'IRT']);
        \App\Models\Order::query()->create(['tenant_id' => $tenant->id, 'user_id' => $buyer->id, 'number' => 'A-2', 'status' => 'pending_payment', 'total_minor' => 500, 'subtotal_minor' => 500, 'currency' => 'IRT']);
        \App\Models\SupportTicket::query()->create(['tenant_id' => $tenant->id, 'user_id' => $buyer->id, 'subject' => 'Help', 'status' => 'open']);

        $this->enableSubmodule($tenant->id, 'users', 'customers');
        $this->actingAs($admin, 'sanctum');

        $this->getJson("/api/v1/customers/{$buyer->id}/profile")
            ->assertOk()
            ->assertJsonPath('data.customer.phone', '09120000000')
            ->assertJsonPath('data.stats.orders_count', 2)
            ->assertJsonPath('data.stats.paid_orders_count', 1)
            ->assertJsonPath('data.stats.total_spent_minor', 1000)
            ->assertJsonPath('data.stats.open_tickets', 1)
            ->assertJsonCount(2, 'data.recent_orders');

        $other = $this->createTenant();
        $stranger = User::factory()->create(['tenant_id' => $other->id, 'role' => 'customer']);
        $this->getJson("/api/v1/customers/{$stranger->id}/profile")->assertNotFound();
        $this->getJson("/api/v1/customers/{$admin->id}/profile")->assertNotFound();
    }

    public function test_staff_can_set_kyc_status(): void
    {
        $tenant = $this->createTenant();
        $admin = $this->adminFor($tenant);
        $buyer = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'customer']);
        $this->enableSubmodule($tenant->id, 'users', 'customers');
        $this->actingAs($admin, 'sanctum');

        $this->patchJson("/api/v1/customers/{$buyer->id}", ['kyc_status' => 'verified'])->assertOk()
            ->assertJsonPath('data.kyc_status', 'verified');
        $this->assertNotNull($buyer->fresh()->kyc_verified_at);
        $this->patchJson("/api/v1/customers/{$buyer->id}", ['kyc_status' => 'bogus'])->assertStatus(422);
    }
}
