<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Services\Accounting\AccountCoding;
use App\Services\Accounting\ExpensePosting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\AccChartAccount;
use Modules\Accounting\Services\LedgerPosting;
use Tests\TestCase;

/**
 * The chart has to know every account the product posts to.
 *
 * The seeded chart stopped at 113/211, so every other flow — rent, a cheque, a printer
 * bought as a fixed asset — created its account on demand, unnamed and typed `asset` whatever
 * it was. A rent payment landed in assets: the ledger balanced perfectly and the profit and
 * loss showed no expenses at all.
 */
class ChartCodingTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'chart.test', 'slug' => 'ch']);
    }

    public function test_every_posted_code_has_a_named_account_with_the_right_type(): void
    {
        $seed = require base_path('modules/Accounting/Database/data/chart-iran.php');

        $byCode = [];
        foreach ($seed as $row) {
            $byCode[$row['code']] = $row;
        }

        // Every code the codebase writes to must be in the seed: a flow that has to invent its
        // own account cannot be read by an accountant.
        $required = array_keys(AccountCoding::namedCodes());

        $missing = array_values(array_filter($required, fn (string $code): bool => ! isset($byCode[$code])));

        $this->assertSame([], $missing, 'codes posted to but not seeded: '.implode(', ', $missing));

        foreach (AccountCoding::namedCodes() as $code => $expected) {
            $this->assertSame($expected['type'], $byCode[$code]['type'], "code {$code} is seeded with the wrong type");
            $this->assertTrue((bool) $byCode[$code]['is_postable'], "code {$code} must be postable");
        }
    }

    /** An unknown code is typed from its numbering rather than dumped into assets. */
    public function test_an_unseeded_code_is_typed_from_its_prefix(): void
    {
        $this->assertSame('expense', AccountCoding::typeForPrefix('6999'));
        $this->assertSame('revenue', AccountCoding::typeForPrefix('4400'));
        $this->assertSame('liability', AccountCoding::typeForPrefix('2299'));
        $this->assertSame('asset', AccountCoding::typeForPrefix('1510'));

        $entry = app(LedgerPosting::class)->post(
            [
                ['code' => '6999', 'debit' => 500_000],
                ['code' => '1102', 'credit' => 500_000],
            ],
            ['tenant_id' => $this->tenant->id, 'document_date' => now()->toDateString()],
        );

        $this->assertGreaterThan(0, $entry->id);

        $type = AccChartAccount::query()->where('code', '6999')->value('type');
        $this->assertSame('expense', $type);
    }

    /** The rent a café actually pays must reach the expense side of the P&L. */
    public function test_rent_is_an_expense_and_reads_as_one(): void
    {
        app(ExpensePosting::class)->record((int) $this->tenant->id, [
            'title' => 'اجاره آبان',
            'amount_minor' => 12_000_000,
            'category' => 'rent',
            'spent_on' => now()->toDateString(),
        ]);

        $type = AccChartAccount::query()->where('code', '6102')->value('type');

        $this->assertSame('expense', $type);
    }

    /** Depreciation and disposal need their own accounts, or they land in "other". */
    public function test_fixed_asset_accounts_exist_before_the_first_depreciation(): void
    {
        foreach (['1201', '1209', '6108', '4201', '6198'] as $code) {
            $this->assertArrayHasKey($code, AccountCoding::namedCodes(), "code {$code} is unnamed");
        }

        $this->assertSame('asset', AccountCoding::namedCodes()['1209']['type']);
        $this->assertSame('expense', AccountCoding::namedCodes()['6108']['type']);
    }

    /** The cheques the ledger tracks need a balance each, not a shared "other receivables". */
    public function test_cheque_accounts_are_in_the_chart(): void
    {
        $this->assertSame('asset', AccountCoding::namedCodes()['1104']['type']);
        $this->assertSame('liability', AccountCoding::namedCodes()['2106']['type']);

        // And the ledger's own constants must agree with what the chart names.
        $this->assertSame('1104', \App\Services\Accounting\ChequeLedger::CHEQUES_IN_HAND);
        $this->assertSame('2106', \App\Services\Accounting\ChequeLedger::CHEQUES_PAYABLE);
    }
}
