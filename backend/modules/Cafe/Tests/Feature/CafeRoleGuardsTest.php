<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\RoleCapability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The hard limits the role matrix promises, checked from the API inwards.
 *
 * The capability matrix says a cook sees only their station's board, a waiter never touches the
 * drawer, and a cashier cannot reprice the menu. Those are the promises a shop relies on when it
 * hands a tablet to someone on their first week, and until now nothing tested them: a route
 * added later without `can:` would silently widen every one of them.
 */
class CafeRoleGuardsTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'roles.test', 'slug' => 'rl']);

        $this->enableSubmodules($this->tenant->id, [
            'cafe.menu' => true,
            'commerce.catalog' => true,
            'commerce.accounting' => true,
        ]);

        // Roles are seeded per tenant from the config matrix; a test tenant has none until it
        // does, so the grants the product ships with are written here verbatim.
        foreach (config('capabilities.cafe_roles', []) as $role => $capabilities) {
            foreach ($capabilities as $capability) {
                RoleCapability::query()->create([
                    'tenant_id' => $this->tenant->id,
                    'role' => $role,
                    'capability' => $capability,
                ]);
            }
        }
    }

    private function actingAsRole(string $role): User
    {
        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => $role,
        ]);

        $this->actingAs($user, 'sanctum');

        return $user;
    }

    /** The kitchen board is the cook's whole world, and nobody else's. */
    public function test_a_cook_reaches_the_kitchen_board(): void
    {
        $this->actingAsRole('cook');

        $this->getJson('/api/v1/cafe/kitchen-orders')->assertOk();
    }

    /** A cook has no till: taking an order or reading the drawer is a 403, not a hidden button. */
    public function test_a_cook_cannot_take_an_order_or_read_the_drawer(): void
    {
        $this->actingAsRole('cook');

        // The till bootstrap and the shift/drawer screen, both behind `pos.use`.
        $this->getJson('/api/v1/cafe/pos/bootstrap')->assertForbidden();
        $this->getJson('/api/v1/cafe/pos/shift')->assertForbidden();
    }

    /** A waiter seats and serves; money is someone else's job. */
    public function test_a_waiter_cannot_touch_the_drawer(): void
    {
        $waiter = $this->actingAsRole('waiter');
        $shift = \Modules\Cafe\Entities\CafeShift::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $waiter->id,
            'status' => 'open',
        ]);

        // The floor board is theirs.
        $this->getJson('/api/v1/cafe/floor')->assertOk();

        // Opening a shift and moving cash are not.
        $this->postJson('/api/v1/cafe/pos/shift/open', [])->assertForbidden();
        $this->getJson('/api/v1/cafe/pos/shifts')->assertForbidden();
        // And a manager-level action — accepting a cash difference — is not theirs either.
        $this->postJson('/api/v1/cafe/pos/shifts/'.$shift->id.'/count', [])->assertForbidden();
    }

    /** A cashier sells but never reprices the menu. */
    public function test_a_cashier_cannot_change_a_price(): void
    {
        $this->actingAsRole('cashier');

        $this->getJson('/api/v1/cafe/pos/bootstrap')->assertOk();

        // The pricing screen and the menu import are where prices live, and a cashier is not
        // in either — `catalog.*` is the grant that decides, and a cashier never holds it.
        $this->getJson('/api/v1/cafe/pricing')->assertForbidden();
        $this->postJson('/api/v1/cafe/menu-import/preview', [])->assertForbidden();
    }

    /** A branch manager runs the shop but does not read the tenant's books. */
    public function test_a_branch_manager_sees_operations_but_not_the_ledger(): void
    {
        $this->actingAsRole('branch_manager');

        $this->getJson('/api/v1/cafe/workbench')->assertOk();
        $this->getJson('/api/v1/erp-accounting/journals')->assertForbidden();
    }

    /** An admin is unrestricted, so the guards above cannot be passing because nothing works. */
    public function test_an_admin_reaches_everything_the_others_were_refused(): void
    {
        $this->actingAsRole('admin');

        $this->getJson('/api/v1/cafe/pos/bootstrap')->assertOk();
        $this->getJson('/api/v1/cafe/kitchen-orders')->assertOk();
        $this->getJson('/api/v1/erp-accounting/journals')->assertOk();
    }

    /** A cook's board must not leak another shop's tickets, whatever capability they hold. */
    public function test_the_kitchen_board_is_tenant_scoped(): void
    {
        $other = $this->createTenant(['domain' => 'other-roles.test', 'slug' => 'orl']);

        Order::query()->create([
            'tenant_id' => $other->id,
            'number' => 'OTHER-1',
            'status' => 'paid',
            'currency' => 'IRT',
            'subtotal_minor' => 0,
            'total_minor' => 0,
            'table_number' => 'T1',
        ]);

        $this->actingAsRole('cook');

        $response = $this->getJson('/api/v1/cafe/kitchen-orders')->assertOk();

        $this->assertSame([], $response->json('data'));
    }
}
