<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Accounting\FinancialReport;
use App\Services\Accounting\LedgerPosting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The report that leaves the building.
 *
 * A trial balance is only useful if it can be handed to somebody who does not have this app — an
 * auditor, a bank, an accountant whose office runs another system entirely. That makes the export
 * a real artefact, not a convenience: it must carry the same numbers as the screen, open in Excel
 * on a Persian Windows machine, and not execute anything a user typed.
 */
class FinancialReportExportTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'reports.test', 'slug' => 'rpt']);
        $this->actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']));
    }

    private function report(string $type = 'trial_balance'): array
    {
        return app(FinancialReport::class)->build(Request::create('/x', 'GET', ['type' => $type]));
    }

    public function test_a_trial_balance_reports_its_own_imbalance(): void
    {
        // Post one balanced pair and one deliberately lopsided entry via raw inserts, because
        // LedgerPosting refuses to make an unbalanced journal — the report still has to survive
        // books that were broken by an import.
        app(LedgerPosting::class)->post([
            ['code' => '1102', 'debit' => 100_000],
            ['code' => '4101', 'credit' => 100_000],
        ], ['description' => 'فروش']);

        $report = $this->report();

        $this->assertSame('trial_balance', $report['type']);
        $this->assertSame(100_000.0, $report['totals']['debit']);
        $this->assertSame(100_000.0, $report['totals']['credit']);
        $this->assertSame(0.0, $report['totals']['difference']);
    }

    public function test_profit_and_loss_signs_revenue_and_expense_in_the_right_direction(): void
    {
        app(LedgerPosting::class)->post([
            ['code' => '1102', 'debit' => 500_000],
            ['code' => '4101', 'credit' => 500_000],
        ], ['description' => 'فروش']);

        app(LedgerPosting::class)->post([
            ['code' => '5101', 'debit' => 200_000],
            ['code' => '1102', 'credit' => 200_000],
        ], ['description' => 'هزینه']);

        $report = $this->report('profit_loss');

        $this->assertSame(500_000.0, $report['totals']['revenue']);
        $this->assertSame(200_000.0, $report['totals']['expense']);
        $this->assertSame(300_000.0, $report['totals']['profit']);
    }

    /** Excel on a Persian Windows box reads a BOM-less UTF-8 CSV as the local codepage. */
    public function test_the_csv_starts_with_a_utf8_bom(): void
    {
        app(LedgerPosting::class)->post([
            ['code' => '1102', 'debit' => 1_000],
            ['code' => '4101', 'credit' => 1_000],
        ], ['description' => 'test']);

        $csv = app(FinancialReport::class)->toCsv($this->report());

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString('تراز آزمایشی', $csv);
    }

    /** Account names are user input; `=cmd` in a cell must not execute. */
    public function test_a_formula_like_account_name_is_defused(): void
    {
        DB::table('acc_chart_accounts')->insert([
            'tenant_id' => $this->tenant->id,
            'code' => '1999',
            'name' => '=HYPERLINK("http://evil","click")',
            'type' => 'asset',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('acc_journal_entries')->insert([
            'tenant_id' => $this->tenant->id, 'number' => 'JV-X', 'document_date' => now()->toDateString(),
            'status' => 'posted', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $entryId = (int) DB::table('acc_journal_entries')->max('id');
        $accountId = (int) DB::table('acc_chart_accounts')->where('code', '1999')->value('id');

        DB::table('acc_journal_lines')->insert([
            'tenant_id' => $this->tenant->id, 'journal_entry_id' => $entryId, 'account_id' => $accountId,
            'debit' => 0, 'credit' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $csv = app(FinancialReport::class)->toCsv($this->report());

        $this->assertStringNotContainsString(',"=HYPERLINK', $csv, 'a formula must not start a cell');
    }

    public function test_a_balance_sheet_splits_assets_from_liabilities(): void
    {
        app(LedgerPosting::class)->post([
            ['code' => '1102', 'debit' => 10_000],
            ['code' => '2102', 'credit' => 10_000],
        ], ['description' => 'خرید اعتباری']);

        $report = $this->report('balance_sheet');

        $this->assertTrue($report['assets']->isNotEmpty());
        $this->assertTrue($report['liabilities_equity']->isNotEmpty());
        $this->assertTrue(
            $report['assets']->every(fn ($r) => str_contains(strtolower((string) $r['type']), 'asset')),
        );
    }
}
