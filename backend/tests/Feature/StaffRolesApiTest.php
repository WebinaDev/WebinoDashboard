<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaffRolesApiTest extends TestCase
{
    use RefreshDatabase;

    protected function adminFor(Tenant $tenant): User
    {
        return User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
    }

    public function test_staff_crud_and_role_assign(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = $this->adminFor($tenant);

        $this->enableSubmodule($tenant->id, 'users', 'staff');
        $this->enableSubmodule($tenant->id, 'users', 'rbac');
        $this->actingAs($admin, 'sanctum');

        $created = $this->postJson('/api/v1/staff', [
            'name' => 'Clerk',
            'email' => 'clerk@example.test',
            'password' => 'password123',
            'role' => 'staff',
        ])->assertCreated()->json('data');

        $this->assertSame('staff', $created['role']);

        $this->getJson('/api/v1/staff')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta']);

        $this->patchJson('/api/v1/staff/'.$created['id'], [
            'role' => 'admin',
        ])->assertOk()->assertJsonPath('data.role', 'admin');

        $roles = $this->getJson('/api/v1/roles')->assertOk()->json();
        $this->assertTrue(isset($roles['data']['roles']) || isset($roles['roles']));

        $target = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'customer',
        ]);

        $this->putJson('/api/v1/roles', [
            'user_id' => $target->id,
            'role' => 'staff',
        ])->assertOk()->assertJsonPath('data.role', 'staff');
    }
}
