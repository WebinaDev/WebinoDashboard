<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Services\Accounting\FixedAssets;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Equipment on the balance sheet.
 *
 * The two ways this goes wrong in real books are both tested here: depreciating past the
 * residual value, and posting the same month twice because someone pressed the button again.
 */
class FixedAssetsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'assets.test', 'slug' => 'fa']);
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

    /** Buying a machine debits the asset account and credits the drawer. */
    public function test_buying_an_asset_posts_to_the_asset_account(): void
    {
        $result = app(FixedAssets::class)->create($this->tenant->id, [
            'name' => 'دستگاه اسپرسو',
            'cost_minor' => 400_000_000,
            'useful_life_months' => 60,
            'acquired_on' => now()->startOfMonth()->toDateString(),
        ]);

        $this->assertGreaterThan(0, $result['journal_entry_id']);
        $this->assertSame(400_000_000.0, $this->balanceOf('1201'));
        $this->assertSame(-400_000_000.0, $this->balanceOf('1102'));
    }

    /** A month of straight-line depreciation, once. */
    public function test_a_month_of_depreciation_posts_once(): void
    {
        $assets = app(FixedAssets::class);

        $assets->create($this->tenant->id, [
            'name' => 'فِر',
            'cost_minor' => 120_000_000,
            'useful_life_months' => 60,
            'acquired_on' => now()->subMonths(2)->startOfMonth()->toDateString(),
        ]);

        $period = now()->format('Y-m');
        $first = $assets->depreciate($this->tenant->id, $period);

        $this->assertSame(1, $first['posted']);
        // 120,000,000 / 60 = 2,000,000 a month.
        $this->assertSame(2_000_000.0, $first['total_minor']);

        $second = $assets->depreciate($this->tenant->id, $period);

        $this->assertSame(0, $second['posted'], 'the same month must not post twice');
        $this->assertSame(1, $second['skipped']);
    }

    /** Depreciation never takes the book value below the residual. */
    public function test_depreciation_stops_at_the_residual_value(): void
    {
        $assets = app(FixedAssets::class);

        $created = $assets->create($this->tenant->id, [
            'name' => 'یخچال',
            'cost_minor' => 10_000_000,
            'salvage_minor' => 1_000_000,
            'useful_life_months' => 3,
            'acquired_on' => now()->subYear()->toDateString(),
        ]);

        // Three months of (10,000,000 − 1,000,000) / 3 = 3,000,000 each.
        foreach ([now()->subMonths(3), now()->subMonths(2), now()->subMonth()] as $at) {
            $assets->depreciate($this->tenant->id, $at->format('Y-m'));
        }

        $asset = DB::table('acc_fixed_assets')->where('id', $created['asset_id'])->first();

        $this->assertSame(9_000_000.0, (float) $asset->accumulated_minor, 'accumulated stops at cost − residual');
        $this->assertSame(1_000_000.0, (float) $asset->cost_minor - (float) $asset->accumulated_minor);
        $this->assertSame('fully_depreciated', (string) $asset->status);

        // Running again is a no-op rather than a negative amount.
        $again = $assets->depreciate($this->tenant->id, now()->format('Y-m'));
        $this->assertSame(0, $again['posted']);
    }

    /** Disposal clears cost and accumulated, and states the gain or loss. */
    public function test_disposal_clears_the_asset_and_reports_the_gain(): void
    {
        $assets = app(FixedAssets::class);

        $created = $assets->create($this->tenant->id, [
            'name' => 'میز',
            'cost_minor' => 30_000_000,
            'useful_life_months' => 30,
            'acquired_on' => now()->subMonths(10)->startOfMonth()->toDateString(),
        ]);

        $assets->depreciate($this->tenant->id, now()->subMonth()->format('Y-m'));

        $result = $assets->dispose($this->tenant->id, $created['asset_id'], 25_000_000);

        $this->assertSame(0.0, $this->balanceOf('1201'), 'the asset account is cleared');
        $this->assertSame(0.0, $this->balanceOf('1209'), 'accumulated depreciation is cleared');
        $this->assertTrue($result['gain_minor'] !== 0.0, 'a sale above book value is a gain');
    }

    /** A residual worth more than the asset is a typo, not a plan. */
    public function test_a_residual_above_cost_is_refused(): void
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);

        app(FixedAssets::class)->create($this->tenant->id, [
            'name' => 'Typo',
            'cost_minor' => 1_000_000,
            'salvage_minor' => 2_000_000,
        ]);
    }
}
