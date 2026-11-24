<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Services\Accounting\Treasury;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The cash position, derived rather than stored.
 *
 * A balance that lives in a column drifts the first time a document is posted twice or reversed;
 * a balance that is the sum of the ledger cannot. These tests pin the derivation, and the
 * forecast's refusal to invent future sales.
 */
class TreasuryTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'treasury.test', 'slug' => 'tr']);
    }

    private function post(string $date, string $code, float $debit, float $credit): void
    {
        $entryId = (int) DB::table('acc_journal_entries')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'number' => 'JV-'.uniqid(),
            'document_date' => $date,
            'status' => 'posted',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $accountId = (int) (DB::table('acc_chart_accounts')
            ->where('tenant_id', $this->tenant->id)->where('code', $code)->value('id')
            ?? DB::table('acc_chart_accounts')->insertGetId([
                'tenant_id' => $this->tenant->id,
                'code' => $code,
                'name' => $code,
                'type' => 'asset',
                'created_at' => now(),
                'updated_at' => now(),
            ]));

        DB::table('acc_journal_lines')->insert([
            'tenant_id' => $this->tenant->id,
            'journal_entry_id' => $entryId,
            'account_id' => $accountId,
            'debit' => $debit,
            'credit' => $credit,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** A drawer's balance is the ledger's cash account, not a stored figure. */
    public function test_an_account_balance_comes_from_the_ledger(): void
    {
        DB::table('acc_cash_accounts')->insert([
            'tenant_id' => $this->tenant->id,
            'name' => 'صندوق',
            'type' => 'cash',
            'chart_code' => '1102',
            'is_default' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->post(now()->toDateString(), '1102', 5_000_000, 0);
        $this->post(now()->toDateString(), '1102', 0, 1_500_000);

        $accounts = app(Treasury::class)->accounts((int) $this->tenant->id);

        $this->assertCount(1, $accounts);
        $this->assertSame(3_500_000.0, $accounts[0]['balance_minor']);
    }

    /** Opening + in − out = closing, and the opening is the balance before the first day. */
    public function test_cash_flow_reconciles(): void
    {
        $from = now()->startOfMonth();
        $to = now()->endOfMonth();

        $this->post(now()->subMonths(3)->toDateString(), '1102', 10_000_000, 0);
        $this->post(now()->startOfMonth()->addDays(2)->toDateString(), '1102', 2_000_000, 0);
        $this->post(now()->startOfMonth()->addDays(3)->toDateString(), '1102', 0, 500_000);

        $flow = app(Treasury::class)->cashFlow((int) $this->tenant->id, $from, $to);

        $this->assertSame(10_000_000.0, $flow['opening_minor']);
        $this->assertSame(2_000_000.0, $flow['inflow_minor']);
        $this->assertSame(500_000.0, $flow['outflow_minor']);
        $this->assertSame(11_500_000.0, $flow['closing_minor']);
    }

    /** Overdue commitments are separated from the coming weeks, not mixed in. */
    public function test_overdue_commitments_are_reported_separately(): void
    {
        DB::table('supplier_invoices')->insert([
            'tenant_id' => $this->tenant->id,
            'status' => 'open',
            'total_minor' => 1_000_000,
            'paid_minor' => 400_000,
            'issued_on' => now()->subMonth()->toDateString(),
            'due_on' => now()->subDays(3)->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('supplier_invoices')->insert([
            'tenant_id' => $this->tenant->id,
            'status' => 'open',
            'total_minor' => 2_000_000,
            'paid_minor' => 0,
            'issued_on' => now()->toDateString(),
            'due_on' => now()->addDays(4)->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $forecast = app(Treasury::class)->dueForecast((int) $this->tenant->id, 4);

        $this->assertSame(600_000.0, $forecast['overdue']['bills_minor'], 'the unpaid remainder of the late bill');
        $this->assertSame(2_000_000.0, $forecast['weeks'][0]['bills_minor']);
        $this->assertSame('known_commitments_only', $forecast['scope']);
    }

    /** A closed cheque is not a commitment any more. */
    public function test_cashed_cheques_do_not_appear_in_the_forecast(): void
    {
        DB::table('acc_checks')->insert([
            [
                'tenant_id' => $this->tenant->id, 'type' => 'payable', 'number' => 'C-1',
                'amount' => 900_000, 'due_date' => now()->addDays(2)->toDateString(),
                'status' => 'cashed', 'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'tenant_id' => $this->tenant->id, 'type' => 'payable', 'number' => 'C-2',
                'amount' => 700_000, 'due_date' => now()->addDays(2)->toDateString(),
                'status' => 'pending', 'created_at' => now(), 'updated_at' => now(),
            ],
        ]);

        $forecast = app(Treasury::class)->dueForecast((int) $this->tenant->id, 2);

        $this->assertSame(700_000.0, $forecast['weeks'][0]['cheques_minor']);
    }
}
