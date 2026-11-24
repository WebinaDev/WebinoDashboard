<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Accounting\ExpensePosting;
use App\Services\Accounting\PartyLedger;
use App\Services\Accounting\SupplierBills;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Expenses, supplier bills, and credit that is enforced rather than reported.
 *
 * Each of these previously required hand-writing a journal, or had nowhere to live at all. The
 * assertions are therefore about *what the ledger says afterwards* — a form that saves without
 * posting is the exact failure this slice exists to remove.
 */
class ExpensesAndCreditTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'ex.test', 'slug' => 'ex']);

        $this->owner = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);

        $this->actingAs($this->owner, 'sanctum');
    }

    private function balanceOf(string $code): float
    {
        return (float) DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->where('jl.tenant_id', $this->tenant->id)
            ->where('a.code', $code)
            ->selectRaw('COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) as bal')
            ->value('bal');
    }

    /** Rent of 12,000,000: debit rent, credit the drawer. Both sides, automatically. */
    public function test_recording_an_expense_posts_a_balanced_journal(): void
    {
        $result = app(ExpensePosting::class)->record($this->tenant->id, [
            'title' => 'اجاره آبان',
            'amount_minor' => 12_000_000,
            'category' => 'rent',
            'spent_on' => now()->toDateString(),
        ], (int) $this->owner->id);

        $this->assertGreaterThan(0, $result['journal_entry_id']);
        $this->assertSame(12_000_000.0, $this->balanceOf('6102'), 'rent account carries the cost');
        $this->assertSame(-12_000_000.0, $this->balanceOf('1102'), 'the drawer was credited');

        $this->assertSame(1, DB::table('expenses')->where('tenant_id', $this->tenant->id)->count());
    }

    /** An expense without a positive amount is not an expense. */
    public function test_an_expense_needs_a_positive_amount(): void
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);

        app(ExpensePosting::class)->record($this->tenant->id, [
            'title' => 'Nothing',
            'amount_minor' => 0,
        ]);
    }

    /**
     * A supplier bill credits payables; paying it debits payables and credits the drawer.
     *
     * Partial payment is the normal case, so the bill closes only when it is covered.
     */
    public function test_a_supplier_bill_posts_to_payables_and_closes_when_paid(): void
    {
        $bills = app(SupplierBills::class);

        $created = $bills->create($this->tenant->id, [
            'supplier_reference' => 'SUP-4411',
            'issued_on' => now()->toDateString(),
            'due_on' => now()->addDays(20)->toDateString(),
            'total_minor' => 5_000_000,
        ], (int) $this->owner->id);

        $this->assertSame(5_000_000.0, $this->balanceOf('2102'), 'payables carries the bill');

        $first = $bills->pay($this->tenant->id, $created['bill_id'], 2_000_000, null, (int) $this->owner->id);

        $this->assertSame('open', $first['status'], 'a part payment does not close the bill');
        $this->assertSame(3_000_000.0, $first['remaining_minor']);
        $this->assertSame(3_000_000.0, $this->balanceOf('2102'));

        $second = $bills->pay($this->tenant->id, $created['bill_id'], 3_000_000, null, (int) $this->owner->id);

        $this->assertSame('paid', $second['status']);
        $this->assertSame(0.0, $this->balanceOf('2102'));
    }

    /** Paying more than the bill owes is a mistake, not an overpayment to absorb. */
    public function test_a_payment_larger_than_the_bill_is_refused(): void
    {
        $bills = app(SupplierBills::class);

        $created = $bills->create($this->tenant->id, ['total_minor' => 1_000_000], (int) $this->owner->id);

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $bills->pay($this->tenant->id, $created['bill_id'], 2_000_000, null, (int) $this->owner->id);
    }

    /** The statement of account is the documents, with a running balance. */
    public function test_the_statement_runs_a_balance_from_the_documents(): void
    {
        $personId = (int) DB::table('acc_persons')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Sara',
            'type' => 'customer',
            'credit_limit' => 10_000_000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('acc_invoices')->insert([
            'tenant_id' => $this->tenant->id,
            'person_id' => $personId,
            'type' => 'sales',
            'number' => 'INV-1',
            'document_date' => now()->toDateString(),
            'status' => 'posted',
            'total' => 4_000_000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('acc_receipt_vouchers')->insert([
            'tenant_id' => $this->tenant->id,
            'person_id' => $personId,
            'type' => 'receipt',
            'number' => 'RC-1',
            'amount' => 1_500_000,
            'document_date' => now()->toDateString(),
            'status' => 'posted',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $statement = app(PartyLedger::class)->statement($this->tenant->id, $personId);

        $this->assertSame(2_500_000.0, $statement['closing_balance']);
        $this->assertSame(2_500_000.0, app(PartyLedger::class)->balance($this->tenant->id, $personId));
        $this->assertCount(2, $statement['entries']);
        $this->assertSame(7_500_000.0, $statement['available']);
    }

    /** A limit is a limit: the sale that would cross it is refused before it happens. */
    public function test_a_credit_sale_over_the_limit_is_refused(): void
    {
        $personId = (int) DB::table('acc_persons')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Reza',
            'type' => 'customer',
            'credit_limit' => 2_000_000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('acc_invoices')->insert([
            'tenant_id' => $this->tenant->id,
            'person_id' => $personId,
            'type' => 'sales',
            'number' => 'INV-9',
            'document_date' => now()->toDateString(),
            'status' => 'posted',
            'total' => 1_800_000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        app(PartyLedger::class)->assertCanBorrow($this->tenant->id, $personId, 500_000);
    }

    /** A party with no limit is cash only; that is not the same as unlimited. */
    public function test_a_party_with_no_limit_is_cash_only(): void
    {
        $personId = (int) DB::table('acc_persons')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Walk-in',
            'type' => 'customer',
            'credit_limit' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        app(PartyLedger::class)->assertCanBorrow($this->tenant->id, $personId, 1);
    }

    /** A blocked party cannot take on new debt, whatever their limit says. */
    public function test_a_blocked_party_cannot_borrow(): void
    {
        $personId = (int) DB::table('acc_persons')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Blocked Co',
            'type' => 'customer',
            'credit_limit' => 50_000_000,
            'is_blocked' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        app(PartyLedger::class)->assertCanBorrow($this->tenant->id, $personId, 1_000_000);
    }
}
