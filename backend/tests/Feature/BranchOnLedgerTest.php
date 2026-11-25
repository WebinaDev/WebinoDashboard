<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Services\Accounting\ExpensePosting;
use App\Services\Reports\CafeReports;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Three branches in one panel, and one P&L per branch.
 *
 * Before this the ledger had no branch at all, so the shop on Valiasr and the one in Tajrish
 * shared a single set of numbers. The filter is strict on purpose: head-office cost with no
 * branch does not get folded into a branch that happens to be the first one, because that makes
 * one branch look unprofitable and the other look better than it is.
 */
class BranchOnLedgerTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'branches.test', 'slug' => 'br']);
    }

    /** An expense tagged with a branch posts into that branch's ledger. */
    public function test_an_expense_carries_its_branch_into_the_journal(): void
    {
        $result = app(ExpensePosting::class)->record($this->tenant->id, [
            'title' => 'برق شعبه دو',
            'amount_minor' => 3_000_000,
            'category' => 'utilities',
            'branch_id' => 2,
        ]);

        $branchId = DB::table('acc_journal_entries')->where('id', $result['journal_entry_id'])->value('branch_id');

        $this->assertSame(2, (int) $branchId);
        $this->assertSame(2, (int) DB::table('expenses')->where('id', $result['expense_id'])->value('branch_id'));
    }

    /** An expense with no branch stays unassigned rather than defaulting to the first branch. */
    public function test_an_untagged_expense_stays_unassigned(): void
    {
        $result = app(ExpensePosting::class)->record($this->tenant->id, [
            'title' => 'هزینه دفتر مرکزی',
            'amount_minor' => 1_000_000,
            'category' => 'other',
        ]);

        $this->assertNull(DB::table('acc_journal_entries')->where('id', $result['journal_entry_id'])->value('branch_id'));
    }

    /** A branch's P&L counts that branch's expenses and not its neighbour's. */
    public function test_a_branch_profit_and_loss_sees_only_its_own_expenses(): void
    {
        $expenses = app(ExpensePosting::class);

        $expenses->record($this->tenant->id, ['title' => 'اجاره شعبه ۱', 'amount_minor' => 10_000_000, 'category' => 'rent', 'branch_id' => 1]);
        $expenses->record($this->tenant->id, ['title' => 'اجاره شعبه ۲', 'amount_minor' => 20_000_000, 'category' => 'rent', 'branch_id' => 2]);

        $report = app(CafeReports::class);

        $first = $report->profitAndLoss($this->tenant->id, now()->startOfDay(), now()->endOfDay(), 1);
        $second = $report->profitAndLoss($this->tenant->id, now()->startOfDay(), now()->endOfDay(), 2);
        $all = $report->profitAndLoss($this->tenant->id, now()->startOfDay(), now()->endOfDay(), null);

        $this->assertSame(10_000_000, $first['expenses_minor']);
        $this->assertSame(20_000_000, $second['expenses_minor']);
        $this->assertSame(30_000_000, $all['expenses_minor']);
    }

    /** The VAT report obeys the same branch filter as the P&L beside it. */
    public function test_the_vat_report_can_be_narrowed_to_one_branch(): void
    {
        $expenses = app(ExpensePosting::class);
        $expenses->record($this->tenant->id, ['title' => 'هزینه شعبه ۳', 'amount_minor' => 5_000_000, 'category' => 'repairs', 'branch_id' => 3]);

        $report = app(CafeReports::class);
        $branch3 = $report->vatSummary($this->tenant->id, now()->startOfDay(), now()->endOfDay(), 3);
        $branch9 = $report->vatSummary($this->tenant->id, now()->startOfDay(), now()->endOfDay(), 9);

        $this->assertSame(3, $branch3['branch_id']);
        $this->assertSame(0, $branch3['input_tax_minor'] + $branch3['output_tax_minor'], 'this expense carried no VAT');
        $this->assertSame(9, $branch9['branch_id']);
    }
}
