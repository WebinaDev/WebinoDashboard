<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UsersApiTest extends TestCase
{
    use RefreshDatabase;

    protected function adminUser(): User
    {
        $tenant = Tenant::query()->create([
            'name' => 'Users Shop',
            'slug' => 'users-shop',
            'domain' => 'users-shop.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Users Shop',
            'default_currency' => 'IRR',
        ]);

        $this->enableSubmodules($tenant->id, [
            'users.customers' => true,
        ]);

        /** @var User $user */
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);

        return $user;
    }

    public function test_users_index_returns_envelope_with_role_counts(): void
    {
        $admin = $this->adminUser();
        User::factory()->create([
            'tenant_id' => $admin->tenant_id,
            'role' => 'customer',
            'name' => 'Buyer One',
            'email' => 'buyer@example.test',
            'phone' => '09120000001',
        ]);

        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/users')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['role_counts', 'total']]);
    }

    public function test_users_show_and_reset_password(): void
    {
        $admin = $this->adminUser();
        $customer = User::factory()->create([
            'tenant_id' => $admin->tenant_id,
            'role' => 'customer',
            'email' => 'c@example.test',
        ]);

        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/users/'.$customer->id)
            ->assertOk()
            ->assertJsonPath('data.user.id', $customer->id);

        $this->postJson('/api/v1/users/'.$customer->id.'/reset-password', ['password' => 'newpass12'])
            ->assertOk();

        $this->assertTrue(Hash::check('newpass12', $customer->fresh()->password));
    }
}
