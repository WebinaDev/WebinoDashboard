<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Accounting\CashTransfer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Moving money between the shop's own accounts.
 *
 * The failure this guards against is subtle: a transfer recorded as revenue. If the drawer is
 * credited but the bank line is posted to a sales account, the shop "earns" money for driving
 * cash down the street, pays tax on it, and the two account balances no longer sum to what they
 * summed before. Every test here checks that shape, not just that a row appeared.
 */
class CashTransferTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'transfer.test', 'slug' => 'trf']);

        // Signed in, because the chart is per tenant and LedgerPosting resolves an account code
        // *within the active tenant*. Without a user the scope is skipped and the test would be
        // exercising a path no request ever takes.
        $this->actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']));
    }

    private function account(string $name, string $code): int
    {
        // Cash and bank are assets; creating them here rather than seeding keeps the test
        // independent of whichever chart the installer happens to ship.
        // `acc_chart_accounts` is unique on tenant_id+code, so two shops in one test database
        // can both own 1110 — which is exactly the situation the service has to survive.
        if (! DB::table('acc_chart_accounts')->where('tenant_id', $this->tenant->id)->where('code', $code)->exists()) {
            DB::table('acc_chart_accounts')->insert([
                'tenant_id' => $this->tenant->id,
                'code' => $code,
                'name' => $name,
                'type' => 'asset',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return (int) DB::table('acc_cash_accounts')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'type' => 'cash',
            'chart_code' => $code,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** Stock the drawer with opening cash so it has something to move. */
    private function fund(int $accountId, string $code, float $amount): void
    {
        app(\Modules\Accounting\Services\LedgerPosting::class)->post([
            ['code' => $code, 'debit' => $amount, 'description' => 'موجودی اولیه'],
            ['code' => '3101', 'credit' => $amount, 'description' => 'سرمایه'],
        ], ['description' => 'افتتاحیه', 'document_date' => now()->toDateString()]);
    }

    private function balance(string $code): float
    {
        $row = DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->where('a.code', $code)
            ->where('a.tenant_id', $this->tenant->id)
            ->where('jl.tenant_id', $this->tenant->id)
            ->selectRaw('COALESCE(SUM(jl.debit),0) as d, COALESCE(SUM(jl.credit),0) as c')
            ->first();

        return round((float) $row->d - (float) $row->c, 2);
    }

    public function test_a_transfer_moves_money_without_touching_profit_and_loss(): void
    {
        $drawer = $this->account('صندوق', '1110');
        $bank = $this->account('بانک', '1120');
        $this->fund($drawer, '1110', 500_000);

        $result = app(CashTransfer::class)->transfer($this->tenant->id, $drawer, $bank, 200_000);

        $this->assertSame(300_000.0, $this->balance('1110'), 'drawer emptied');
        $this->assertSame(200_000.0, $this->balance('1120'), 'bank filled');
        $this->assertSame(500_000.0, $this->balance('1110') + $this->balance('1120'), 'total assets unchanged');
        $this->assertSame(300_000.0, $result['from']['balance_after_minor']);
        $this->assertSame(200_000.0, $result['to']['balance_after_minor']);
    }

    public function test_the_transfer_journal_is_balanced(): void
    {
        $drawer = $this->account('صندوق', '1110');
        $bank = $this->account('بانک', '1120');
        $this->fund($drawer, '1110', 100_000);

        app(CashTransfer::class)->transfer($this->tenant->id, $drawer, $bank, 40_000);

        $entry = DB::table('acc_journal_entries')->orderByDesc('id')->first();
        $lines = DB::table('acc_journal_lines')->where('journal_entry_id', $entry->id)->get();

        $this->assertCount(2, $lines, 'a transfer is two lines, not three');
        $this->assertSame(
            round((float) $lines->sum('debit'), 2),
            round((float) $lines->sum('credit'), 2),
        );
    }

    public function test_the_drawer_cannot_lend_money_it_does_not_have(): void
    {
        $drawer = $this->account('صندوق', '1110');
        $bank = $this->account('بانک', '1120');
        $this->fund($drawer, '1110', 10_000);

        $this->expectException(ValidationException::class);

        try {
            app(CashTransfer::class)->transfer($this->tenant->id, $drawer, $bank, 50_000);
        } finally {
            // The refusal must not leave a half-posted journal behind.
            $this->assertSame(10_000.0, $this->balance('1110'));
            $this->assertSame(0.0, $this->balance('1120'));
        }
    }

    public function test_an_account_from_another_shop_cannot_be_used(): void
    {
        $drawer = $this->account('صندوق', '1110');
        $this->fund($drawer, '1110', 100_000);

        $other = $this->createTenant(['domain' => 'other.test', 'slug' => 'oth']);
        DB::table('acc_chart_accounts')->insert([
            'tenant_id' => $other->id,
            'code' => '1110',
            'name' => 'صندوق (کسب‌وکار دیگر)',
            'type' => 'asset',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('acc_cash_accounts')->insert([
            'tenant_id' => $other->id,
            'name' => 'صندوق دیگری',
            'type' => 'cash',
            'chart_code' => '1110',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $foreignId = (int) DB::table('acc_cash_accounts')->where('tenant_id', $other->id)->value('id');

        $this->expectException(ValidationException::class);

        app(CashTransfer::class)->transfer($this->tenant->id, $drawer, $foreignId, 10_000);
    }

    public function test_transferring_to_the_same_account_is_refused(): void
    {
        $drawer = $this->account('صندوق', '1110');
        $this->fund($drawer, '1110', 100_000);

        $this->expectException(ValidationException::class);

        app(CashTransfer::class)->transfer($this->tenant->id, $drawer, $drawer, 10_000);
    }

    /** An account with no chart code has no ledger identity, so money through it would vanish. */
    public function test_an_unlinked_account_cannot_be_a_transfer_end(): void
    {
        $drawer = $this->account('صندوق', '1110');
        $this->fund($drawer, '1110', 100_000);

        $unlinked = (int) DB::table('acc_cash_accounts')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'کارتخوان بدون کد',
            'type' => 'terminal',
            'chart_code' => null,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(ValidationException::class);

        app(CashTransfer::class)->transfer($this->tenant->id, $drawer, $unlinked, 10_000);
    }
}
