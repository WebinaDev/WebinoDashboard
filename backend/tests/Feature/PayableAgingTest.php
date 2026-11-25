<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Services\Reports\CafeReports;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * What the shop owes, aged by due date.
 *
 * Two decisions this pins, because both are easy to get subtly wrong:
 *  - aging is by **due date**, not issue date. An invoice issued 45 days ago and due yesterday
 *    is one day late; calling it "45 days" sends somebody chasing the wrong supplier.
 *  - a settled bill is not a liability. Counting it would inflate the total by everything the
 *    shop has ever bought.
 */
class PayableAgingTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private int $supplierId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'payables.test', 'slug' => 'pay']);

        $this->supplierId = (int) DB::table('acc_persons')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'آردسازی تهران',
            'type' => 'supplier',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function bill(float $total, ?float $paid, ?string $dueOn, string $status = 'open'): void
    {
        DB::table('supplier_invoices')->insert([
            'tenant_id' => $this->tenant->id,
            'supplier_id' => $this->supplierId,
            'number' => 'SI-'.uniqid(),
            'issued_on' => now()->subDays(45)->toDateString(),
            'due_on' => $dueOn,
            'status' => $status,
            'total_minor' => $total,
            'paid_minor' => $paid ?? 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @return array<string, mixed> */
    private function report(): array
    {
        return app(CafeReports::class)->payableAging($this->tenant->id, Carbon::now());
    }

    public function test_a_bill_due_yesterday_is_one_day_late_not_forty_five(): void
    {
        $this->bill(100_000, 0, now()->subDay()->toDateString());

        $report = $this->report();

        $this->assertSame(1, $report['suppliers'][0]['oldest_days'], 'aged by due date, not issue date');
        $this->assertSame(100_000.0, $report['overdue_minor']);
        $this->assertSame(100_000.0, $report['buckets']['days_30']);
    }

    public function test_a_bill_due_in_the_future_is_current(): void
    {
        $this->bill(50_000, 0, now()->addDays(10)->toDateString());

        $report = $this->report();

        $this->assertSame(50_000.0, $report['buckets']['current']);
        $this->assertSame(0.0, $report['overdue_minor']);
    }

    /** Only the unpaid part is a liability. */
    public function test_partial_payment_reduces_the_balance(): void
    {
        $this->bill(100_000, 60_000, now()->addDays(5)->toDateString());

        $report = $this->report();

        $this->assertSame(40_000.0, $report['total_minor']);
        $this->assertSame(40_000.0, $report['suppliers'][0]['total_minor']);
    }

    public function test_a_paid_bill_is_not_a_liability(): void
    {
        $this->bill(100_000, 100_000, now()->subDays(90)->toDateString());
        $this->bill(70_000, null, now()->addDays(3)->toDateString(), 'cancelled');

        $report = $this->report();

        $this->assertSame(0.0, $report['total_minor']);
        $this->assertSame([], $report['suppliers']);
    }

    /** A bill with no due date cannot be aged, but it is not hidden either. */
    public function test_an_undated_bill_is_counted_separately(): void
    {
        $this->bill(25_000, 0, null);

        $report = $this->report();

        $this->assertSame(25_000.0, $report['undated_minor']);
        $this->assertSame(25_000.0, $report['total_minor'], 'still owed, just not ageable');
    }

    public function test_old_bills_land_in_the_ninety_plus_bucket(): void
    {
        $this->bill(80_000, 0, now()->subDays(120)->toDateString());

        $report = $this->report();

        $this->assertSame(80_000.0, $report['buckets']['days_90']);
        $this->assertSame(120, $report['suppliers'][0]['oldest_days']);
    }
}
