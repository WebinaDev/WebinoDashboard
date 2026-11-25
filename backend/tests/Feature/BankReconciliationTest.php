<?php

namespace Tests\Feature;

use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Services\BankReconciler;
use Tests\TestCase;

/**
 * Bank reconciliation, end to end.
 *
 * The matching engine was written and never called: no route, no screen, no test. The risk with
 * something that has never run is not that it is slow, it is that it is *wrong in a reassuring
 * way* — a reconciliation that reports 100% and has in fact matched nothing is worse than none.
 * These tests therefore assert the difference, not just the counts.
 */
class BankReconciliationTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private int $accountId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'bank.test', 'slug' => 'bank']);

        DB::table('acc_chart_accounts')->insert([
            'tenant_id' => $this->tenant->id,
            'code' => '1103',
            'name' => 'بانک',
            'type' => 'asset',
            'is_postable' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->accountId = (int) DB::table('acc_cash_accounts')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Bank Melli',
            'type' => 'bank',
            'chart_code' => '1103',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** Post a journal line on the bank account. `$debit` > 0 means money in. */
    private function post(float $debit, float $credit, string $date, ?string $documentNo = null): void
    {
        $chartId = (int) DB::table('acc_chart_accounts')
            ->where('tenant_id', $this->tenant->id)
            ->where('code', '1103')
            ->value('id');

        $entryId = (int) DB::table('acc_journal_entries')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'document_date' => $date,
            'document_no' => $documentNo,
            'status' => 'posted',
            'description' => 'test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('acc_journal_lines')->insert([
            'tenant_id' => $this->tenant->id,
            'journal_entry_id' => $entryId,
            'account_id' => $chartId,
            'debit' => $debit,
            'credit' => $credit,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function today(): string
    {
        return now()->toDateString();
    }

    /**
     * A debit in the book is money in, which the statement calls a credit.
     *
     * Getting this sign wrong is the classic reconciliation bug: every row still "matches"
     * because the engine compares magnitudes, and the net difference comes out as twice the
     * movement instead of zero.
     */
    public function test_a_debit_in_the_book_reads_as_money_in(): void
    {
        $this->post(500000, 0, $this->today());

        $book = app(BankReconciler::class)->bookSide(
            $this->tenant->id,
            $this->accountId,
            now()->startOfDay(),
            now()->endOfDay(),
        );

        $this->assertCount(1, $book['rows']);
        $this->assertSame('credit', $book['rows'][0]['type']);
        $this->assertSame(500000.0, $book['rows'][0]['amount']);
    }

    /** A statement and a book that agree reconcile to a net difference of exactly zero. */
    public function test_a_matching_statement_reconciles_to_zero(): void
    {
        $this->post(500000, 0, $this->today(), 'V-1');
        $this->post(0, 120000, $this->today(), 'V-2');

        $statement = "date,amount,reference\n"
            .$this->today().",500000,V-1\n"
            .$this->today().",-120000,V-2\n";

        $result = app(BankReconciler::class)->reconcile(
            $this->tenant->id,
            $this->accountId,
            now()->startOfDay(),
            now()->endOfDay(),
            $statement,
        );

        $this->assertSame(2, $result['summary']['matched_count']);
        $this->assertSame(0.0, $result['gaps']['net_difference'], 'a true reconciliation nets to zero');
        $this->assertSame(380000.0, $result['gaps']['book_net']);
        $this->assertSame(380000.0, $result['gaps']['closing_balance']);
    }

    /** A bank fee nobody posted is the thing this screen exists to find. */
    public function test_a_bank_fee_with_no_book_entry_shows_up_in_the_difference(): void
    {
        $this->post(500000, 0, $this->today(), 'V-1');

        $statement = "date,amount,reference\n"
            .$this->today().",500000,V-1\n"
            .$this->today().",-15000,FEE\n";

        $result = app(BankReconciler::class)->reconcile(
            $this->tenant->id,
            $this->accountId,
            now()->startOfDay(),
            now()->endOfDay(),
            $statement,
        );

        $this->assertSame(1, $result['summary']['matched_count']);
        $this->assertSame(1, $result['summary']['unmatched_bank_count']);
        $this->assertSame(-15000.0, $result['gaps']['net_difference'], 'the fee is unaccounted for');
        $this->assertSame('FEE', $result['unmatched_bank_records'][0]['reference_no']);
    }

    /**
     * A Persian bank export is the normal case, not an edge case.
     *
     * Persian digits, an Arabic thousands separator, a Jalali-looking date and a semicolon
     * delimiter — all of it has to read, or the first real statement a shop uploads returns
     * "0 rows" and the feature looks broken.
     */
    public function test_a_persian_statement_parses(): void
    {
        $statement = "تاریخ;مبلغ;شرح;شماره پیگیری\n"
            ."1403/09/02;۱٬۲۵۰٬۰۰۰;واریز مشتری;۸۸۱۲\n"
            ."1403/09/03;(۲۵۰٬۰۰۰);کارمزد;\n";

        $parsed = app(BankReconciler::class)->parseStatement($statement);

        $this->assertCount(2, $parsed['rows']);
        $this->assertSame('1403-09-02', $parsed['rows'][0]['date']);
        $this->assertSame(1250000.0, $parsed['rows'][0]['amount']);
        $this->assertSame('credit', $parsed['rows'][0]['type']);
        $this->assertSame('8812', $parsed['rows'][0]['reference_no']);
        // A parenthesised amount is a withdrawal, the way every Iranian bank writes it.
        $this->assertSame('debit', $parsed['rows'][1]['type']);
        $this->assertSame(250000.0, $parsed['rows'][1]['amount']);
    }

    /** Separate debit/credit columns are read when the file has no signed amount. */
    public function test_debit_and_credit_columns_are_understood(): void
    {
        $statement = "date,debit,credit,description\n"
            ."2024-11-22,,750000,deposit\n"
            ."2024-11-23,200000,,withdrawal\n";

        $parsed = app(BankReconciler::class)->parseStatement($statement);

        $this->assertCount(2, $parsed['rows']);
        $this->assertSame('credit', $parsed['rows'][0]['type']);
        $this->assertSame(750000.0, $parsed['rows'][0]['amount']);
        $this->assertSame('debit', $parsed['rows'][1]['type']);
    }

    /** A row with no usable date or amount is reported, never silently dropped. */
    public function test_unreadable_rows_are_reported_with_their_line_number(): void
    {
        $statement = "date,amount\n"
            ."not-a-date,1000\n"
            ."2024-11-22,\n";

        $parsed = app(BankReconciler::class)->parseStatement($statement);

        $this->assertSame([], $parsed['rows']);
        $this->assertSame(2, $parsed['skipped'][0]['line'], 'the header is line 1');
        $this->assertSame('date', $parsed['skipped'][0]['reason']);
        $this->assertSame('amount', $parsed['skipped'][1]['reason']);
    }

    /** Without a chart code the book side is empty and says nothing it cannot know. */
    public function test_an_account_without_a_chart_code_reports_no_book_rows(): void
    {
        DB::table('acc_cash_accounts')->where('id', $this->accountId)->update(['chart_code' => null]);
        $this->post(500000, 0, $this->today());

        $book = app(BankReconciler::class)->bookSide(
            $this->tenant->id,
            $this->accountId,
            now()->startOfDay(),
            now()->endOfDay(),
        );

        $this->assertSame([], $book['rows']);
        $this->assertNotNull($book['account']);
    }

    /** Another tenant's account is not reachable, even with a valid id. */
    public function test_another_tenants_account_is_not_found(): void
    {
        $other = $this->createTenant(['domain' => 'bank-other.test', 'slug' => 'bank-other']);

        $this->assertSame([], app(BankReconciler::class)
            ->bookSide($other->id, $this->accountId, now()->startOfDay(), now()->endOfDay())['rows']);
    }
}
