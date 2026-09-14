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
        $tenant = Tenant::factory()->create();
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
}
