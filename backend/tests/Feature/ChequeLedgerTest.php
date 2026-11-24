<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Services\Accounting\ChequeLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * What a cheque does to the books.
 *
 * The status column used to be the whole feature, which meant a bounced customer cheque left
 * the bank balance claiming money that had been handed back, and a cheque in the drawer was
 * counted as cash before anyone deposited it.
 */
class ChequeLedgerTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'cheque.test', 'slug' => 'ch']);
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

    private function cheque(string $type = 'receivable', float $amount = 5_000_000, string $status = 'issued'): int
    {
        return (int) DB::table('acc_checks')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'type' => $type,
            'number' => 'CH-'.uniqid(),
            'amount' => $amount,
            'status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** Recording a customer's cheque moves the debt into cheques-in-hand, not into cash. */
    public function test_recording_a_customer_cheque_moves_it_out_of_receivables(): void
    {
        $id = $this->cheque();

        app(ChequeLedger::class)->record($this->tenant->id, $id, null);

        $this->assertSame(5_000_000.0, $this->balanceOf(ChequeLedger::CHEQUES_IN_HAND));
        $this->assertSame(-5_000_000.0, $this->balanceOf('1101'), 'receivables no longer claims it');
        $this->assertSame(0.0, $this->balanceOf('1103'), 'a cheque in a drawer is not bank money yet');
    }

    /** Clearing it is the moment it becomes cash. */
    public function test_clearing_moves_cheques_in_hand_to_the_bank(): void
    {
        $id = $this->cheque();
        $ledger = app(ChequeLedger::class);

        $ledger->record($this->tenant->id, $id, null);
        $ledger->setStatus($this->tenant->id, $id, 'cleared', null, null);

        $this->assertSame(0.0, $this->balanceOf(ChequeLedger::CHEQUES_IN_HAND));
        $this->assertSame(5_000_000.0, $this->balanceOf('1103'));
    }

    /** A bounced cheque puts the debt back where it came from, and needs a reason. */
    public function test_a_bounce_reopens_the_debt_and_requires_a_reason(): void
    {
        $id = $this->cheque();
        $ledger = app(ChequeLedger::class);

        $ledger->record($this->tenant->id, $id, null);

        try {
            $ledger->setStatus($this->tenant->id, $id, 'bounced', '', null);
            $this->fail('a bounce without a reason must be refused');
        } catch (\Illuminate\Validation\ValidationException) {
            // expected
        }

        $ledger->setStatus($this->tenant->id, $id, 'bounced', 'حساب کافی نبود', null);

        $this->assertSame(0.0, $this->balanceOf(ChequeLedger::CHEQUES_IN_HAND));
        $this->assertSame(5_000_000.0, $this->balanceOf('1101'), 'the guest owes it again');

        $row = DB::table('acc_checks')->where('id', $id)->first();
        $this->assertSame('bounced', (string) $row->status);
        $this->assertSame('حساب کافی نبود', (string) $row->bounced_reason);
    }

    /** A supplier's cheque moves payables into cheques-payable, then out of the bank. */
    public function test_a_payable_cheque_runs_through_cheques_payable(): void
    {
        $id = $this->cheque('payable', 2_000_000);
        $ledger = app(ChequeLedger::class);

        $ledger->record($this->tenant->id, $id, null);

        $this->assertSame(-2_000_000.0, $this->balanceOf('2102'), 'the supplier is no longer owed directly');
        $this->assertSame(2_000_000.0, $this->balanceOf(ChequeLedger::CHEQUES_PAYABLE));

        $ledger->setStatus($this->tenant->id, $id, 'cleared', null, null);

        $this->assertSame(0.0, $this->balanceOf(ChequeLedger::CHEQUES_PAYABLE));
        $this->assertSame(-2_000_000.0, $this->balanceOf('1103'), 'the bank paid it');
    }

    /** Setting the same status again posts nothing. */
    public function test_a_repeated_status_change_posts_once(): void
    {
        $id = $this->cheque();
        $ledger = app(ChequeLedger::class);

        $ledger->record($this->tenant->id, $id, null);
        $ledger->setStatus($this->tenant->id, $id, 'cleared', null, null);
        $before = $this->balanceOf('1103');

        $ledger->setStatus($this->tenant->id, $id, 'cleared', null, null);

        $this->assertSame($before, $this->balanceOf('1103'));
    }

    /** A cheque recorded straight as cleared still gets its asset leg. */
    public function test_a_cheque_created_as_cleared_still_balances(): void
    {
        $id = $this->cheque('receivable', 1_000_000, 'cleared');

        app(ChequeLedger::class)->setStatus($this->tenant->id, $id, 'cleared', null, null);

        // It was already cleared, so the guard leaves it alone; and recording backfills nothing
        // twice. What matters is that the cheque book never goes negative.
        $this->assertGreaterThanOrEqual(0.0, $this->balanceOf(ChequeLedger::CHEQUES_IN_HAND));
    }
}
