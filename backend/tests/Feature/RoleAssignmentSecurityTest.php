<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleAssignmentSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function adminFor(Tenant $tenant): User
    {
        return User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
    }

    public function test_non_admin_cannot_assign_admin_via_roles_endpoint(): void
    {
        $tenant = $this->createTenant();
        $staff = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'staff',
        ]);
        $target = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'customer',
        ]);

        $this->enableSubmodule($tenant->id, 'users', 'rbac');
        $this->actingAs($staff, 'sanctum');

        $this->putJson('/api/v1/roles', [
            'user_id' => $target->id,
            'role' => 'admin',
        ])->assertStatus(422)->assertJsonValidationErrors(['role']);

        $this->assertSame('customer', $target->fresh()->role);
    }

    public function test_admin_cannot_self_promote_via_roles_endpoint(): void
    {
        $tenant = $this->createTenant();
        $admin = $this->adminFor($tenant);

        $this->enableSubmodule($tenant->id, 'users', 'rbac');
        $this->actingAs($admin, 'sanctum');
        // Demote in DB while the authenticated in-memory user may still be admin.
        $admin->forceFill(['role' => 'staff'])->save();

        $this->putJson('/api/v1/roles', [
            'user_id' => $admin->id,
            'role' => 'admin',
        ])->assertStatus(422)->assertJsonValidationErrors(['role']);

        $this->assertSame('staff', $admin->fresh()->role);
    }

    public function test_admin_can_assign_admin_to_another_user(): void
    {
        $tenant = $this->createTenant();
        $admin = $this->adminFor($tenant);
        $target = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'staff',
        ]);

        $this->enableSubmodule($tenant->id, 'users', 'rbac');
        $this->actingAs($admin, 'sanctum');

        $this->putJson('/api/v1/roles', [
            'user_id' => $target->id,
            'role' => 'admin',
        ])->assertOk()->assertJsonPath('data.role', 'admin');
    }
}
