<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Coupon;
use App\Models\Menu;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The trail covers the records a shop is actually asked about.
 *
 * Menus, tables, coupons and the whole accounting master data were invisible in the activity
 * log, which meant "who changed the price list" and "who deleted the coupon" had no answer —
 * and those are the two questions a manager asks when the month does not add up.
 */
class AuditCoverageTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'audit.test', 'slug' => 'au']);

        $this->owner = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);

        $this->actingAs($this->owner, 'sanctum');
    }

    /** A menu edit leaves a row naming the field that moved. */
    public function test_editing_a_menu_is_recorded(): void
    {
        $menu = Menu::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'منوی اصلی',
            'slug' => 'main',
            'menu_type' => 'cafe',
        ]);

        $menu->update(['name' => 'منوی زمستان']);

        $log = ActivityLog::query()
            ->where('subject_type', 'Menu')
            ->where('subject_id', $menu->id)
            ->where('event', 'updated')
            ->latest('id')
            ->first();

        $this->assertNotNull($log, 'a menu rename must be in the trail');
        $this->assertArrayHasKey('name', (array) $log->changes);
        $this->assertSame('منوی زمستان', $log->changes['name']['after']);
    }

    /** A coupon deletion is kept, because "who removed the discount" has an owner. */
    public function test_deleting_a_coupon_is_recorded(): void
    {
        $coupon = Coupon::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => 'NOROOZ',
            'type' => 'percent',
            'amount' => 10,
            'status' => 'publish',
        ]);

        $coupon->delete();

        $this->assertTrue(
            ActivityLog::query()
                ->where('subject_type', 'Coupon')
                ->where('subject_id', $coupon->id)
                ->where('event', 'deleted')
                ->exists(),
            'a deleted coupon must leave a trail row',
        );
    }

    /** A customer's credit limit is a financial control, so changing it is auditable. */
    public function test_changing_a_credit_limit_is_recorded(): void
    {
        $personId = (int) DB::table('acc_persons')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Sara',
            'type' => 'customer',
            'credit_limit' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        \Modules\Accounting\Entities\AccPerson::query()->findOrFail($personId)->update(['credit_limit' => 5_000_000]);

        $log = ActivityLog::query()
            ->where('subject_type', 'AccPerson')
            ->where('subject_id', $personId)
            ->where('event', 'updated')
            ->latest('id')
            ->first();

        $this->assertNotNull($log);
        $this->assertArrayHasKey('credit_limit', (array) $log->changes);
    }
}
