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

    /**
     * The chart of accounts is the skeleton every report hangs on, so an edit to it is kept.
     *
     * This covers the accounting entities in `App\Models` and the module entities in
     * `Modules\Accounting\Entities`; both are edited from the same controller and both had
     * been invisible to the trail.
     */
    public function test_editing_a_ledger_account_is_recorded(): void
    {
        $account = \App\Models\AccAccount::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => '5200',
            'name' => 'هزینه اجاره',
            'type' => 'expense',
        ]);

        $account->update(['name' => 'هزینه اجاره و شارژ']);

        $log = ActivityLog::query()
            ->where('subject_type', 'AccAccount')
            ->where('subject_id', $account->id)
            ->where('event', 'updated')
            ->latest('id')
            ->first();

        $this->assertNotNull($log, 'renaming an account changes how its history reads');
        $this->assertArrayHasKey('name', (array) $log->changes);
    }

    /** A chart account in the module's own table is covered too. */
    public function test_editing_a_chart_account_is_recorded(): void
    {
        $id = (int) DB::table('acc_chart_accounts')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'code' => '7310',
            'name' => 'قهوه',
            'type' => 'expense',
            'is_postable' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        \Modules\Accounting\Entities\AccChartAccount::query()->findOrFail($id)->update(['name' => 'قهوه و دانه']);

        $this->assertTrue(
            ActivityLog::query()
                ->where('subject_type', 'AccChartAccount')
                ->where('subject_id', $id)
                ->where('event', 'updated')
                ->exists(),
        );
    }

    /** Cash handled inside a shift is auditable: the trail is the only place that says who. */
    public function test_a_drawer_movement_is_recorded(): void
    {
        $shiftId = (int) DB::table('cafe_shifts')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->owner->id,
            'opened_at' => now(),
            'status' => 'open',
            'opening_float_minor' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $movement = \Modules\Cafe\Entities\CafeShiftMovement::query()->create([
            'tenant_id' => $this->tenant->id,
            'shift_id' => $shiftId,
            'type' => 'cash_out',
            'amount_minor' => 100_000,
            'reason' => 'پرداخت به تأمین‌کننده',
        ]);

        $this->assertTrue(
            ActivityLog::query()
                ->where('subject_type', 'CafeShiftMovement')
                ->where('subject_id', $movement->id)
                ->where('event', 'created')
                ->exists(),
            'a cash movement out of the drawer must name an actor',
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
