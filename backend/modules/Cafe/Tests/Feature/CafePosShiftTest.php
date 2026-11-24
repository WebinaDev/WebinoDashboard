<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\RoleCapability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Cafe\Entities\CafeShift;
use Modules\Cafe\Services\CafeShiftService;
use Modules\Cafe\Services\OrderPayments;
use Tests\TestCase;

/**
 * Cashier shift + cash-drawer reconciliation.
 *
 * The point of these tests is the arithmetic a cashier is trusted with: expected cash must
 * equal float + cash sales + cash in - cash out - drops, and nothing else may leak into it.
 */
class CafePosShiftTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'pos-shift.test', 'slug' => 'pos-shift']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];

        // The shift routes are gated on pos.use; 'staff' holds no capabilities unless granted.
        RoleCapability::query()->firstOrCreate(['tenant_id' => $this->tenant->id, 'role' => 'staff', 'capability' => 'pos.use']);
        // The accountant audits drawers but must never be able to move cash.
        RoleCapability::query()->firstOrCreate(['tenant_id' => $this->tenant->id, 'role' => 'accountant', 'capability' => 'accounting.manage']);
    }

    private function cashier(): User
    {
        return User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'staff',
        ]);
    }

    private function order(User $cashier, int $totalMinor, string $tender, array $overrides = []): Order
    {
        return Order::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'created_by' => $cashier->id,
            'number' => 'POS-'.uniqid(),
            'status' => 'completed',
            'total_minor' => $totalMinor,
            'subtotal_minor' => $totalMinor,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'tax_minor' => 0,
            'payment_tender' => $tender,
            'amount_paid_minor' => $totalMinor,
            'currency' => 'IRT',
        ], $overrides));
    }

    public function test_expected_cash_counts_only_cash_tenders(): void
    {
        $cashier = $this->cashier();
        $shift = app(CafeShiftService::class)->openShift($cashier, ['opening_float_minor' => 500_000]);

        // 2 cash sales, 1 card sale, 1 wallet sale.
        $this->order($cashier, 120_000, 'cash');
        $this->order($cashier, 80_000, 'cash');
        $this->order($cashier, 400_000, 'pos_terminal');
        $this->order($cashier, 60_000, 'wallet');

        $totals = app(CafeShiftService::class)->computeTotals($shift);

        $this->assertSame(200_000, $totals['cash_sales_minor'], 'only cash tenders belong in the drawer');
        $this->assertSame(460_000, $totals['non_cash_sales_minor'], 'card + wallet are bank settlements');
        $this->assertSame(660_000, $totals['gross_sales_minor']);
        $this->assertSame(4, $totals['orders']);
        // float 500k + cash 200k
        $this->assertSame(700_000, $totals['expected_cash_minor']);
    }

    public function test_split_payments_count_only_current_amounts_by_tender(): void
    {
        $cashier = $this->cashier();
        $shift = app(CafeShiftService::class)->openShift($cashier, ['opening_float_minor' => 10]);
        $order = $this->order($cashier, 100, 'cash');
        $payments = app(OrderPayments::class);
        $payments->replace($order, [['tender' => 'cash', 'amount_minor' => 100]]);
        $payments->replace($order, [
            ['tender' => 'cash', 'amount_minor' => 30],
            ['tender' => 'pos_terminal', 'amount_minor' => 70],
        ]);

        $totals = app(CafeShiftService::class)->computeTotals($shift);

        $this->assertSame(30, $totals['cash_sales_minor']);
        $this->assertSame(70, $totals['non_cash_sales_minor']);
        $this->assertSame(40, $totals['expected_cash_minor']);
        $this->assertSame(100, $totals['gross_sales_minor']);
    }

    public function test_cancelled_and_unpaid_orders_are_excluded(): void
    {
        $cashier = $this->cashier();
        $shift = app(CafeShiftService::class)->openShift($cashier, ['opening_float_minor' => 0]);

        $this->order($cashier, 100_000, 'cash');
        $this->order($cashier, 999_000, 'cash', ['status' => 'cancelled']);
        $this->order($cashier, 888_000, 'cash', ['status' => 'pending_payment']);
        $this->order($cashier, 777_000, 'cash', ['status' => 'refunded']);

        $totals = app(CafeShiftService::class)->computeTotals($shift);

        $this->assertSame(1, $totals['orders']);
        $this->assertSame(100_000, $totals['gross_sales_minor']);
        $this->assertSame(100_000, $totals['expected_cash_minor']);
    }

    /**
     * A sale replayed from an offline till lands in the drawer it was taken at.
     *
     * The old arithmetic summed orders whose `created_at` fell between open and close. A sale
     * taken at 21:40 on a dead connection and pushed at 09:10 the next morning fell outside
     * every window: the cash was in the drawer, the count came up short, and nothing in the
     * system could say why.
     */
    public function test_an_attributed_sale_arriving_after_the_shift_still_counts(): void
    {
        $cashier = $this->cashier();
        $service = app(CafeShiftService::class);
        $shift = $service->openShift($cashier, ['opening_float_minor' => 100_000]);

        // Taken during the shift but recorded now, after it closed.
        $late = $this->order($cashier, 70_000, 'cash', ['shift_id' => $shift->id]);
        $shift->update(['closed_at' => now()->subHours(9)]);
        $late->forceFill(['created_at' => now()])->save();

        $totals = $service->computeTotals($shift->fresh());

        $this->assertSame(70_000, $totals['cash_sales_minor'], 'attribution beats the timestamp window');
        $this->assertSame(170_000, $totals['expected_cash_minor']);
    }

    /** A sale attributed to a *different* drawer must not inflate this one, however timed. */
    public function test_a_sale_from_another_shift_is_not_counted(): void
    {
        $first = $this->cashier();
        $second = $this->cashier();
        $service = app(CafeShiftService::class);

        $shiftA = $service->openShift($first, ['opening_float_minor' => 0]);
        $shiftB = $service->openShift($second, ['opening_float_minor' => 0]);

        $this->order($second, 90_000, 'cash', ['shift_id' => $shiftB->id]);

        $this->assertSame(0, $service->computeTotals($shiftA)['cash_sales_minor']);
        $this->assertSame(90_000, $service->computeTotals($shiftB)['cash_sales_minor']);
    }

    /** Orders recorded before the column existed keep being counted by their timestamp. */
    public function test_an_unattributed_order_is_still_counted_by_its_window(): void
    {
        $cashier = $this->cashier();
        $service = app(CafeShiftService::class);
        $shift = $service->openShift($cashier, ['opening_float_minor' => 0]);

        $this->order($cashier, 50_000, 'cash');

        $this->assertNull(Order::query()->latest('id')->first()->shift_id);
        $this->assertSame(50_000, $service->computeTotals($shift)['cash_sales_minor']);
    }

    public function test_cash_movements_adjust_the_drawer(): void
    {
        $cashier = $this->cashier();
        $service = app(CafeShiftService::class);
        $shift = $service->openShift($cashier, ['opening_float_minor' => 200_000]);

        $this->order($cashier, 300_000, 'cash');

        $service->addMovement($cashier, $shift, ['type' => 'cash_in', 'amount_minor' => 50_000, 'reason' => 'change fund']);
        $service->addMovement($cashier, $shift, ['type' => 'cash_out', 'amount_minor' => 30_000, 'reason' => 'milk supplier']);
        $service->addMovement($cashier, $shift, ['type' => 'drop', 'amount_minor' => 100_000, 'reason' => 'mid-day banking']);
        // A no-sale must not move money.
        $service->addMovement($cashier, $shift, ['type' => 'no_sale', 'amount_minor' => 999_999, 'reason' => 'drawer opened']);

        $totals = $service->computeTotals($shift);

        // 200k float + 300k cash + 50k in - 30k out - 100k drop
        $this->assertSame(420_000, $totals['expected_cash_minor']);
        $this->assertSame(50_000, $totals['cash_in_minor']);
        $this->assertSame(30_000, $totals['cash_out_minor']);
        $this->assertSame(100_000, $totals['drops_minor']);
    }

    public function test_short_drawer_reports_negative_variance(): void
    {
        $cashier = $this->cashier();
        $service = app(CafeShiftService::class);
        $shift = $service->openShift($cashier, ['opening_float_minor' => 0]);

        $this->order($cashier, 500_000, 'cash');

        // Cashier counts 480k when the system expects 500k: 20k short.
        $closed = $service->closeShift($cashier, $shift, ['counted_cash_minor' => 480_000]);

        $this->assertSame(500_000, $closed->expected_cash_minor);
        $this->assertSame(-20_000, $closed->variance_minor);
        $this->assertSame(CafeShift::STATUS_CLOSED, $closed->status);
        $this->assertNotNull($closed->closed_at);
    }

    public function test_over_drawer_reports_positive_variance(): void
    {
        $cashier = $this->cashier();
        $service = app(CafeShiftService::class);
        $shift = $service->openShift($cashier, ['opening_float_minor' => 100_000]);

        $this->order($cashier, 200_000, 'cash');

        $closed = $service->closeShift($cashier, $shift, ['counted_cash_minor' => 315_000]);

        // expected = 100k + 200k = 300k, counted 315k → +15k
        $this->assertSame(300_000, $closed->expected_cash_minor);
        $this->assertSame(15_000, $closed->variance_minor);
    }

    public function test_a_second_open_shift_is_rejected(): void
    {
        $cashier = $this->cashier();
        $service = app(CafeShiftService::class);
        $service->openShift($cashier, ['opening_float_minor' => 0]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $service->openShift($cashier, ['opening_float_minor' => 0]);
    }

    public function test_closed_shift_rejects_further_movements(): void
    {
        $cashier = $this->cashier();
        $service = app(CafeShiftService::class);
        $shift = $service->openShift($cashier, ['opening_float_minor' => 0]);
        $closed = $service->closeShift($cashier, $shift, ['counted_cash_minor' => 0]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $service->addMovement($cashier, $closed, ['type' => 'cash_in', 'amount_minor' => 1000]);
    }

    public function test_http_open_count_close_round_trip(): void
    {
        $cashier = $this->cashier();

        $open = $this->actingAs($cashier, 'sanctum')
            ->postJson('/api/v1/cafe/pos/shift/open', ['opening_float_minor' => 200_000], $this->h)
            ->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.opening_float_minor', 200_000);

        $shiftId = $open->json('data.id');

        $this->actingAs($cashier, 'sanctum')
            ->getJson('/api/v1/cafe/pos/shift', $this->h)
            ->assertOk()
            ->assertJsonPath('data.id', $shiftId);

        $this->order($cashier, 150_000, 'cash');

        $this->actingAs($cashier, 'sanctum')
            ->postJson("/api/v1/cafe/pos/shifts/{$shiftId}/close", ['counted_cash_minor' => 350_000], $this->h)
            ->assertOk()
            ->assertJsonPath('data.expected_cash_minor', 350_000)
            ->assertJsonPath('data.variance_minor', 0)
            ->assertJsonPath('data.status', 'closed');

        // Nothing open any more.
        $this->actingAs($cashier, 'sanctum')
            ->getJson('/api/v1/cafe/pos/shift', $this->h)
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    public function test_a_cashier_cannot_read_another_cashiers_shift(): void
    {
        $owner = $this->cashier();
        $other = $this->cashier();
        $shift = app(CafeShiftService::class)->openShift($owner, ['opening_float_minor' => 0]);

        $this->actingAs($other, 'sanctum')
            ->getJson("/api/v1/cafe/pos/shifts/{$shift->id}", $this->h)
            ->assertForbidden();
    }

    public function test_totals_are_frozen_at_close(): void
    {
        $cashier = $this->cashier();
        $service = app(CafeShiftService::class);
        $shift = $service->openShift($cashier, ['opening_float_minor' => 0]);

        $order = $this->order($cashier, 100_000, 'cash');
        $closed = $service->closeShift($cashier, $shift, ['counted_cash_minor' => 100_000]);

        $this->assertSame(0, $closed->variance_minor);

        // Someone voids the order after the till was reconciled. The closed shift must not budge:
        // the drawer was counted against the numbers as they stood.
        $order->update(['status' => 'cancelled']);

        $reloaded = $closed->fresh();
        $this->assertSame(100_000, $reloaded->expected_cash_minor);
        $this->assertSame(0, $reloaded->variance_minor);

        // But the live recompute reflects reality for anyone asking now.
        $live = $service->computeTotals($reloaded);
        $this->assertSame(0, $live['expected_cash_minor']);
    }

    public function test_an_accountant_can_audit_but_never_move_cash(): void
    {
        $cashier = $this->cashier();
        $accountant = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'accountant',
        ]);

        $shift = app(CafeShiftService::class)->openShift($cashier, ['opening_float_minor' => 100_000]);

        // Read: the whole audit surface is open to them.
        $this->actingAs($accountant, 'sanctum')
            ->getJson('/api/v1/cafe/pos/shifts', $this->h)
            ->assertOk();

        $this->actingAs($accountant, 'sanctum')
            ->getJson("/api/v1/cafe/pos/shifts/{$shift->id}", $this->h)
            ->assertOk()
            ->assertJsonPath('data.id', $shift->id);

        // Write: every mutation is refused, so the till stays the cashier's alone.
        $this->actingAs($accountant, 'sanctum')
            ->postJson('/api/v1/cafe/pos/shift/open', ['opening_float_minor' => 0], $this->h)
            ->assertForbidden();

        $this->actingAs($accountant, 'sanctum')
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/close", ['counted_cash_minor' => 0], $this->h)
            ->assertForbidden();

        $this->actingAs($accountant, 'sanctum')
            ->postJson("/api/v1/cafe/pos/shifts/{$shift->id}/movements", [
                'type' => 'cash_in',
                'amount_minor' => 5_000,
            ], $this->h)
            ->assertForbidden();

        // The shift is untouched by all of that.
        $fresh = $shift->fresh();
        $this->assertSame(CafeShift::STATUS_OPEN, $fresh->status);
        $this->assertSame(0, $fresh->movements()->count());
    }
}
