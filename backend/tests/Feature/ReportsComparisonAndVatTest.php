<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Services\Reports\CafeReports;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Two reports whose whole value is that they refuse to flatter.
 *
 * A period comparison that divides by zero, or that compares unequal windows, produces numbers
 * that look authoritative and are not. A VAT summary that silently picks one of two disagreeing
 * figures hides exactly the thing an accountant needs to see.
 */
class ReportsComparisonAndVatTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'reports.test', 'slug' => 'rt']);
    }

    private function order(string $at, int $total, int $tax = 0): void
    {
        DB::table('orders')->insert([
            'tenant_id' => $this->tenant->id,
            'number' => 'R-'.uniqid(),
            'status' => 'completed',
            'subtotal_minor' => $total - $tax,
            'total_minor' => $total,
            'tax_minor' => $tax,
            'currency' => 'IRT',
            'created_at' => $at,
            'updated_at' => $at,
        ]);
    }

    /** Equal-length windows: a 31-day month is compared with the 31 days before it. */
    public function test_the_previous_period_is_the_same_number_of_days(): void
    {
        $from = now()->startOfMonth();
        $to = now()->startOfMonth()->addDays(30);

        $result = app(CafeReports::class)->comparePeriods((int) $this->tenant->id, $from, $to);

        $this->assertSame(31, $result['days']);
        $this->assertSame('31', (string) $from->copy()->startOfDay()->diffInDays(\Illuminate\Support\Carbon::parse($result['previous']['to'])->startOfDay()) + 1);
    }

    /** Growth is measured against the previous window, not against nothing. */
    public function test_it_reports_the_direction_of_change(): void
    {
        $this->order(now()->subDays(2)->toDateTimeString(), 200_000);
        $this->order(now()->subDays(40)->toDateTimeString(), 100_000);

        $result = app(CafeReports::class)->comparePeriods(
            (int) $this->tenant->id,
            now()->subDays(7),
            now(),
        );

        $revenue = collect($result['metrics'])->firstWhere('key', 'net_revenue');

        $this->assertSame(200_000.0, (float) $revenue['current']);
        $this->assertSame(100_000.0, (float) $revenue['previous']);
        $this->assertSame(100.0, $revenue['change_percent']);
    }

    /** With nothing to compare against, the percentage is null rather than an infinity. */
    public function test_a_change_from_zero_is_reported_as_unknown(): void
    {
        $this->order(now()->subDay()->toDateTimeString(), 50_000);

        $result = app(CafeReports::class)->comparePeriods(
            (int) $this->tenant->id,
            now()->subDays(7),
            now(),
        );

        $revenue = collect($result['metrics'])->firstWhere('key', 'net_revenue');

        $this->assertNull($revenue['change_percent']);
    }

    /**
     * VAT: output minus input, and the sales-side cross-check reported, not reconciled away.
     *
     * The journal here disagrees with the orders on purpose — a sale posted without tax — and
     * the report must say so instead of picking the tidier number.
     */
    public function test_vat_reports_both_sides_and_the_difference_from_orders(): void
    {
        $this->order(now()->subDay()->toDateTimeString(), 1_090_000, 90_000);

        $entryId = (int) DB::table('acc_journal_entries')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'number' => 'JV-1',
            'document_date' => now()->toDateString(),
            'status' => 'posted',
            'description' => 'فروش',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $accountId = (int) DB::table('acc_chart_accounts')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'code' => '2101',
            'name' => 'مالیات بر ارزش افزوده پرداختنی',
            'type' => 'liability',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('acc_journal_lines')->insert([
            [
                'tenant_id' => $this->tenant->id, 'journal_entry_id' => $entryId, 'account_id' => $accountId,
                'debit' => 0, 'credit' => 90_000, 'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'tenant_id' => $this->tenant->id, 'journal_entry_id' => $entryId, 'account_id' => $accountId,
                'debit' => 40_000, 'credit' => 0, 'created_at' => now(), 'updated_at' => now(),
            ],
        ]);

        $result = app(CafeReports::class)->vatSummary((int) $this->tenant->id, now()->subDays(7), now());

        $this->assertSame(90_000, $result['output_tax_minor']);
        $this->assertSame(40_000, $result['input_tax_minor']);
        $this->assertSame(50_000, $result['payable_minor']);
        $this->assertTrue($result['reconciles'], 'the ledger agrees with the orders here');
        $this->assertSame(90_000, $result['tax_on_orders_minor']);
    }

    /** Input tax above output tax is a credit carried forward, not a negative payable. */
    public function test_input_tax_above_output_becomes_a_credit(): void
    {
        $entryId = (int) DB::table('acc_journal_entries')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'number' => 'JV-2',
            'document_date' => now()->toDateString(),
            'status' => 'posted',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $accountId = (int) DB::table('acc_chart_accounts')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'code' => '2101',
            'name' => 'VAT',
            'type' => 'liability',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('acc_journal_lines')->insert([
            'tenant_id' => $this->tenant->id, 'journal_entry_id' => $entryId, 'account_id' => $accountId,
            'debit' => 120_000, 'credit' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $result = app(CafeReports::class)->vatSummary((int) $this->tenant->id, now()->subDays(7), now());

        $this->assertSame(-120_000, $result['payable_minor']);
        $this->assertSame(120_000, $result['credit_carried_minor']);
    }
}
