<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\RoleCapability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Cafe\Entities\CafeDayClose;
use Modules\Cafe\Entities\CafeShift;
use Modules\Cafe\Services\CafeShiftService;
use Modules\Cafe\Services\DayCloseService;
use Modules\Cafe\Services\ShiftJournal;
use Modules\Cafe\Services\TillReports;
use Tests\TestCase;

/**
 * Blind counts, manager approval, X/Z and the day close.
 *
 * The controls here are the difference between a till that reports and a till that can be
 * trusted: a cashier must not be shown the expected drawer before counting, a difference must
 * need a second signature, and the day must not close over an open drawer.
 */
class CafeCashControlTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $cashier;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'cash.test', 'slug' => 'cash']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);

        RoleCapability::query()->firstOrCreate(['tenant_id' => $this->tenant->id, 'role' => 'staff', 'capability' => 'pos.use']);
        // A manager is whoever may approve a drawer.
        RoleCapability::query()->firstOrCreate(['tenant_id' => $this->tenant->id, 'role' => 'staff', 'capability' => 'pos.approve']);

        $this->cashier = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'staff']);
        $this->manager = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'staff']);
    }

    /** The cashier's payload must not contain the expected drawer before they have counted. */
    public function test_the_expected_drawer_is_hidden_from_the_cashier_until_they_count(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 100_000]);
        $this->sale($this->cashier, 50_000);

        $response = $this->actingAs($this->cashier)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->getJson("/api/v1/cafe/pos/shifts/{$shift->id}")
            ->assertOk();

        $this->assertNull($response->json('data.expected_cash_minor'), 'blind count: the cashier is not told what to type');
        $this->assertNull($response->json('data.variance_minor'));
        $this->assertTrue($response->json('data.blind'));
    }

    /** A manager looking at the same till does see it — reconciling is their job. */
    public function test_a_manager_sees_the_expected_drawer(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 100_000]);
        $this->sale($this->cashier, 50_000);

        $this->actingAs($this->manager)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->getJson("/api/v1/cafe/pos/shifts/{$shift->id}")
            ->assertOk()
            ->assertJsonPath('data.expected_cash_minor', 150_000);
    }

    /** A drawer that does not balance cannot be closed by one person. */
    public function test_a_short_drawer_cannot_be_closed_by_the_cashier_alone(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 100_000]);
        $this->sale($this->cashier, 50_000);

        $this->actingAs($this->cashier)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/close", ['counted_cash_minor' => 120_000])
            ->assertStatus(422);

        $shift->refresh();
        $this->assertTrue($shift->isOpen(), 'the drawer stays open until someone approves the difference');
        $this->assertSame(CafeShift::COUNT_PENDING, $shift->count_status);
        $this->assertSame(120_000, (int) $shift->counted_cash_minor, 'the count itself is kept for the manager');
    }

    /** A manager closing it is the second signature. */
    public function test_a_manager_can_close_a_short_drawer(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 100_000]);
        $this->sale($this->cashier, 50_000);

        $this->actingAs($this->manager)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/close", ['counted_cash_minor' => 120_000])
            ->assertOk();

        $shift->refresh();
        $this->assertFalse($shift->isOpen());
        $this->assertSame(-30_000, (int) $shift->variance_minor);
        $this->assertSame($this->manager->id, (int) $shift->approved_by);
    }

    /** A balanced drawer needs no second signature. */
    public function test_an_exact_count_closes_without_approval(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 100_000]);
        $this->sale($this->cashier, 50_000);

        $this->actingAs($this->cashier)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/close", ['counted_cash_minor' => 150_000])
            ->assertOk();

        $this->assertFalse($shift->fresh()->isOpen());
    }

    /** Count first, approve second, close third — the documented cashier flow. */
    public function test_a_submitted_count_can_be_approved_then_closed(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 100_000]);
        $this->sale($this->cashier, 50_000);

        $this->actingAs($this->cashier)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/count", ['counted_cash_minor' => 145_000])
            ->assertOk()
            ->assertJsonPath('data.count_status', CafeShift::COUNT_PENDING);

        $this->actingAs($this->manager)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/count/approve", ['note' => 'تأیید شد'])
            ->assertOk()
            ->assertJsonPath('data.count_status', CafeShift::COUNT_APPROVED);

        // Approved, so the cashier may now close it themselves.
        $this->actingAs($this->cashier)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/close", ['counted_cash_minor' => 145_000])
            ->assertOk();

        $this->assertFalse($shift->fresh()->isOpen());
    }

    /** A cashier must not be able to approve their own count. */
    public function test_a_cashier_cannot_approve_a_count(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 0]);
        app(CafeShiftService::class)->submitCount($this->cashier, $shift, 500);

        $this->actingAs($this->cashier)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/count/approve")
            ->assertStatus(403);
    }

    /** X is a snapshot: reading it never closes anything. */
    public function test_the_x_report_does_not_close_the_shift(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 100_000]);
        $this->sale($this->cashier, 50_000);

        $this->actingAs($this->manager)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->getJson("/api/v1/cafe/pos/shifts/{$shift->id}/x-report")
            ->assertOk()
            ->assertJsonPath('data.kind', 'X')
            ->assertJsonPath('data.drawer.expected_minor', 150_000);

        $this->assertTrue($shift->fresh()->isOpen());
    }

    /** Z reproduces the frozen figures even if an order is refunded afterwards. */
    public function test_the_z_report_is_frozen_at_close(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 100_000]);
        $order = $this->sale($this->cashier, 50_000);

        $this->actingAs($this->manager)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/close", ['counted_cash_minor' => 150_000])
            ->assertOk();

        // A late refund must not rewrite a report the accountant already has.
        $order->update(['status' => 'refunded']);

        $this->actingAs($this->manager)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->getJson("/api/v1/cafe/pos/shifts/{$shift->id}/z-report")
            ->assertOk()
            ->assertJsonPath('data.kind', 'Z')
            ->assertJsonPath('data.sales.gross_minor', 50_000)
            ->assertJsonPath('data.drawer.counted_minor', 150_000);
    }

    /** Closing the till posts the takings into the sales ledger, balanced. */
    public function test_closing_a_shift_posts_a_balanced_sales_journal(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 0]);
        $this->sale($this->cashier, 40_000);
        $this->sale($this->cashier, 60_000, 'pos_terminal');

        $this->actingAs($this->cashier)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/close", ['counted_cash_minor' => 40_000])
            ->assertOk()
            ->assertJsonPath('journal.created', true);

        $shift->refresh();
        $this->assertNotNull($shift->journal_entry_id);

        $journal = \App\Models\AccJournal::query()->findOrFail($shift->journal_entry_id);
        $this->assertSame((int) $journal->total_debit_minor, (int) $journal->total_credit_minor);
        $this->assertSame(100_000, (int) $journal->total_debit_minor);
        $this->assertSame(3, $journal->lines()->count(), 'one revenue credit and one debit per tender');
    }

    /** Posting twice cannot double the day's takings. */
    public function test_the_shift_journal_is_not_posted_twice(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 0]);
        $this->sale($this->cashier, 25_000);

        app(CafeShiftService::class)->closeShift($this->cashier, $shift, ['counted_cash_minor' => 25_000]);
        $first = app(ShiftJournal::class)->post($shift->fresh());
        $second = app(ShiftJournal::class)->post($shift->fresh());

        $this->assertTrue($first['created']);
        $this->assertFalse($second['created']);
        $this->assertSame($first['journal']->id, $second['journal']->id);
        $this->assertSame(1, \App\Models\AccJournal::query()->count());
    }

    /** A day with money still moving in a drawer cannot be signed off. */
    public function test_the_day_cannot_close_while_a_shift_is_open(): void
    {
        app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 0]);
        $this->sale($this->cashier, 10_000);

        $this->actingAs($this->manager)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson('/api/v1/cafe/pos/day/close', ['business_date' => now()->toDateString()])
            ->assertStatus(422);
    }

    /** Once every drawer is closed, the day closes and totals the shifts. */
    public function test_the_day_closes_and_totals_its_shifts(): void
    {
        $shift = app(CafeShiftService::class)->openShift($this->cashier, ['opening_float_minor' => 0]);
        $this->sale($this->cashier, 70_000);
        app(CafeShiftService::class)->closeShift($this->cashier, $shift, ['counted_cash_minor' => 70_000]);

        $this->actingAs($this->manager)
            ->withHeaders(['X-Tenant-Domain' => $this->tenant->domain])
            ->postJson('/api/v1/cafe/pos/day/close', ['business_date' => now()->toDateString()])
            ->assertCreated()
            ->assertJsonPath('data.gross_sales_minor', 70_000)
            ->assertJsonPath('data.status', 'closed');

        $close = CafeDayClose::query()->firstOrFail();
        $this->assertSame($close->id, (int) $shift->fresh()->day_close_id, 'the shift knows which day it belongs to');
    }

    /** A day cannot be closed twice — that would create a rival version of the same day. */
    public function test_the_same_day_cannot_be_closed_twice(): void
    {
        $service = app(DayCloseService::class);
        $date = now()->toDateString();

        $service->close($this->manager, ['business_date' => $date]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $service->close($this->manager, ['business_date' => $date]);
    }

    private function sale(User $cashier, int $totalMinor, string $tender = 'cash'): Order
    {
        return Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'created_by' => $cashier->id,
            'number' => 'CASH-'.uniqid(),
            'status' => 'completed',
            'total_minor' => $totalMinor,
            'subtotal_minor' => $totalMinor,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'tax_minor' => 0,
            'payment_tender' => $tender,
            'amount_paid_minor' => $totalMinor,
            'currency' => 'IRT',
        ]);
    }
}
