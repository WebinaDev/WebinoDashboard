<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Accounting\AmendmentPosting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * An amendment that settles money must leave a journal.
 *
 * The workflow was fully audited and posted nothing, so a ₺200,000 correction made the day's
 * sales and the drawer disagree by exactly that much — and the difference looked like a
 * cashier's shortfall on the next shift's report.
 */
class AmendmentJournalTest extends TestCase
{
    use RefreshDatabase;

    private $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'amend.test', 'slug' => 'am']);

        $this->actingAs(User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]), 'sanctum');
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

    private function amendment(int $delta, string $tender = 'cash'): \App\Models\OrderAmendment
    {
        $orderId = (int) DB::table('orders')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'number' => 'AMD-'.uniqid(),
            'status' => 'completed',
            'subtotal_minor' => 1_000_000,
            'total_minor' => 1_000_000,
            'currency' => 'IRT',
            'branch_id' => 2,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $id = (int) DB::table('order_amendments')->insertGetId([
            'order_id' => $orderId,
            'tenant_id' => $this->tenant->id,
            'status' => 'settled',
            'reason' => 'اشتباه در ثبت',
            'delta_minor' => $delta,
            'settlement_tender' => $tender,
            'settled_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return \App\Models\OrderAmendment::query()->findOrFail($id);
    }

    /** Collecting the difference is income and cash, and lands in the order's branch. */
    public function test_a_collected_difference_posts_to_sales_and_cash(): void
    {
        $amendment = $this->amendment(200_000);

        $result = app(AmendmentPosting::class)->post($amendment);

        $this->assertTrue($result['posted']);
        $this->assertSame(-200_000.0, $this->balanceOf('4101'), 'sales credited');
        $this->assertSame(200_000.0, $this->balanceOf('1102'), 'the drawer received it');

        $branchId = DB::table('acc_journal_entries')->where('id', $result['journal_entry_id'])->value('branch_id');
        $this->assertSame(2, (int) $branchId);
    }

    /** A refund is a return, not negative sales: the two must stay separable. */
    public function test_a_refund_posts_to_sales_returns(): void
    {
        $amendment = $this->amendment(-150_000);

        $result = app(AmendmentPosting::class)->post($amendment);

        $this->assertTrue($result['posted']);
        $this->assertSame(150_000.0, $this->balanceOf('4102'), 'returns debited');
        $this->assertSame(-150_000.0, $this->balanceOf('1102'), 'the drawer paid it out');
        $this->assertSame(0.0, $this->balanceOf('4101'), 'gross sales untouched');
    }

    /** A card amendment goes to the bank, not the drawer. */
    public function test_a_card_amendment_goes_to_the_bank(): void
    {
        $amendment = $this->amendment(90_000, 'pos_terminal');

        app(AmendmentPosting::class)->post($amendment);

        $this->assertSame(90_000.0, $this->balanceOf('1103'));
        $this->assertSame(0.0, $this->balanceOf('1102'));
    }

    /** An amendment that moves no money posts nothing at all. */
    public function test_a_zero_delta_posts_nothing(): void
    {
        $amendment = $this->amendment(0);

        $result = app(AmendmentPosting::class)->post($amendment);

        $this->assertFalse($result['posted']);
        $this->assertSame(0, DB::table('acc_journal_entries')->where('tenant_id', $this->tenant->id)->count());
    }
}
