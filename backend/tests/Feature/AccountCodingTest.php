<?php

namespace Tests\Feature;

use App\Models\AccAccount;
use App\Models\AccAccountCoding;
use App\Models\AccJournal;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderPayment;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Accounting\AccountCoding;
use App\Services\Accounting\OrderAccountingSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Account coding drives the sales journal.
 *
 * The gaps this locks down, in order:
 *  1. A cash sale must debit the drawer, not receivables (the original bug).
 *  2. A split payment must split across two accounts.
 *  3. The coding must be editable and take effect on the next posting.
 *  4. Cost of goods must post when cost is known, and be skipped when it is not.
 *  5. The journal must always balance.
 */
class AccountCodingTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::query()->create([
            'name' => 'Cafe', 'slug' => 'cafe-coding', 'domain' => 'coding.test', 'license_key' => 'k',
            'setup_completed' => true, 'store_display_name' => 'Cafe', 'default_currency' => 'IRR',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'accounting.chart' => true,
            'commerce.orders' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    public function test_defaults_cover_every_role_the_journal_asks_for(): void
    {
        $coding = app(AccountCoding::class);

        foreach (array_keys(AccountCoding::defaults()) as $role) {
            $this->assertTrue(
                $coding->has($this->tenant->id, $role),
                "role [{$role}] has no default code, so the journal cannot post it"
            );
        }

        // Every tender must resolve to a code without any tenant configuration.
        foreach (AccountCoding::TENDERS as $tender) {
            $this->assertNotSame('', $coding->tenderCode($this->tenant->id, $tender));
        }
    }

    public function test_cash_sale_debits_the_drawer_not_receivables(): void
    {
        $order = $this->makeOrder(500_000, [
            ['tender' => 'cash', 'amount_minor' => 500_000],
        ]);

        $invoice = $this->sync()->syncOrder($order);
        $journal = $invoice->journal;

        $cash = AccountCoding::defaults()[AccAccountCoding::ROLE_CASH]['code'];
        $ar = AccountCoding::defaults()[AccAccountCoding::ROLE_AR]['code'];

        $cashLine = DB::table('accounting_journal_lines')
            ->where('journal_id', $journal->id)->where('account_code', $cash)->first();
        $this->assertNotNull($cashLine, 'a cash sale must debit the cash account');
        $this->assertSame(500_000, (int) $cashLine->debit_minor);

        $arLine = DB::table('accounting_journal_lines')
            ->where('journal_id', $journal->id)->where('account_code', $ar)->first();
        $this->assertNull($arLine, 'a fully paid cash sale must not touch receivables');
    }

    public function test_split_payment_lands_in_two_accounts(): void
    {
        $order = $this->makeOrder(495_000, [
            ['tender' => 'cash', 'amount_minor' => 300_000],
            ['tender' => 'pos_terminal', 'amount_minor' => 195_000],
        ]);

        $journal = $this->sync()->syncOrder($order)->journal;

        $cash = AccountCoding::defaults()[AccAccountCoding::ROLE_CASH]['code'];
        $bank = AccountCoding::defaults()[AccAccountCoding::ROLE_BANK]['code'];

        $this->assertSame(300_000, (int) DB::table('accounting_journal_lines')
            ->where('journal_id', $journal->id)->where('account_code', $cash)->value('debit_minor'));

        // Two instruments both map to the bank account, so the row is the sum.
        $this->assertSame(195_000, (int) DB::table('accounting_journal_lines')
            ->where('journal_id', $journal->id)->where('account_code', $bank)->value('debit_minor'));
    }

    public function test_editing_the_coding_changes_the_next_journal(): void
    {
        // Move cash to the tenant's own numbering.
        AccAccount::query()->create([
            'tenant_id' => $this->tenant->id, 'code' => '1010', 'name' => 'صندوق', 'type' => 'asset',
        ]);

        $this->actingAs($this->user)
            ->putJson('/api/v1/accounting/coding', ['tenders' => ['cash' => '1010']])
            ->assertOk();

        $order = $this->makeOrder(100_000, [
            ['tender' => 'cash', 'amount_minor' => 100_000],
        ]);
        $journal = $this->sync()->syncOrder($order)->journal;

        $this->assertSame(100_000, (int) DB::table('accounting_journal_lines')
            ->where('journal_id', $journal->id)->where('account_code', '1010')->value('debit_minor'));
    }

    public function test_coding_rejects_a_code_that_is_not_in_the_chart(): void
    {
        $this->actingAs($this->user)
            ->putJson('/api/v1/accounting/coding', ['roles' => ['sales' => '9999']])
            ->assertStatus(422)
            ->assertJsonPath('errors.coding.0', 'sales:unknown_code:9999');
    }

    public function test_cost_of_goods_posts_when_every_cost_is_known(): void
    {
        $order = $this->makeOrder(500_000, [
            ['tender' => 'cash', 'amount_minor' => 500_000],
        ]);
        $order->items()->update(['unit_cost_minor' => 200_000]);

        $journal = $this->sync()->syncOrder($order->fresh())->journal;

        $cogs = AccountCoding::defaults()[AccAccountCoding::ROLE_COGS]['code'];
        $inventory = AccountCoding::defaults()[AccAccountCoding::ROLE_INVENTORY]['code'];

        $this->assertSame(200_000, (int) DB::table('accounting_journal_lines')
            ->where('journal_id', $journal->id)->where('account_code', $cogs)->value('debit_minor'));
        $this->assertSame(200_000, (int) DB::table('accounting_journal_lines')
            ->where('journal_id', $journal->id)->where('account_code', $inventory)->value('credit_minor'));
    }

    public function test_cost_of_goods_is_skipped_when_a_cost_is_unknown(): void
    {
        $order = $this->makeOrder(500_000, [
            ['tender' => 'cash', 'amount_minor' => 500_000],
        ]);
        $order->items()->update(['unit_cost_minor' => null]);

        $journal = $this->sync()->syncOrder($order->fresh())->journal;

        $cogs = AccountCoding::defaults()[AccAccountCoding::ROLE_COGS]['code'];
        $this->assertSame(0, DB::table('accounting_journal_lines')
            ->where('journal_id', $journal->id)->where('account_code', $cogs)->count(),
            'a partial cost figure would overstate margin, so nothing should post');
    }

    public function test_journal_balances_with_a_discount(): void
    {
        $order = $this->makeOrder(450_000, [
            ['tender' => 'cash', 'amount_minor' => 450_000],
        ]);
        $order->update(['discount_minor' => 50_000]);

        $journal = $this->sync()->syncOrder($order->fresh())->journal;

        $this->assertSame(
            (int) $journal->total_debit_minor,
            (int) $journal->total_credit_minor,
            'a discounted sale must still produce a balanced journal'
        );
        // Gross revenue is credited; the discount is its own debit so it stays visible.
        $sales = AccountCoding::defaults()[AccAccountCoding::ROLE_SALES]['code'];
        $this->assertSame(500_000, (int) DB::table('accounting_journal_lines')
            ->where('journal_id', $journal->id)->where('account_code', $sales)->value('credit_minor'));
    }

    /**
     * @param  list<array{tender: string, amount_minor: int}>  $payments
     */
    private function makeOrder(int $total, array $payments): Order
    {
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'T'.random_int(1000, 9999),
            'status' => 'paid',
            'subtotal_minor' => $total,
            'discount_minor' => 0,
            'tax_minor' => 0,
            'shipping_minor' => 0,
            'total_minor' => $total,
            'currency' => 'IRR',
            'sales_channel' => 'in_store',
            'customer_name' => 'guest',
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'product_name' => 'Latte',
            'quantity' => 1,
            'unit_price_minor' => $total,
            'unit_cost_minor' => null,
            'purchase_type' => 'cash',
        ]);

        foreach ($payments as $p) {
            OrderPayment::query()->create([
                'tenant_id' => $this->tenant->id,
                'order_id' => $order->id,
                'tender' => $p['tender'],
                'amount_minor' => $p['amount_minor'],
                'recorded_by' => $this->user->id,
            ]);
        }

        return $order->fresh();
    }

    private function sync(): OrderAccountingSync
    {
        return app(OrderAccountingSync::class);
    }
}
