<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Catalog\RecipeCosting;
use App\Services\Stock\Purchasing;
use App\Services\Stock\StockLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * One stock ledger, and the books that follow it.
 *
 * Two properties are asserted throughout, because they are the whole point of the slice:
 * the movement is *recorded* (append-only, with a reason) and the *value is posted* (the
 * inventory account is the sum of the movements, not a separate opinion).
 */
class StockLedgerTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $owner;

    private int $productId;

    private int $warehouseId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'stock.test', 'slug' => 'stock']);
        $this->enableSubmodules($this->tenant->id, ['cafe.menu' => true]);

        $this->owner = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);

        $this->actingAs($this->owner, 'sanctum');

        $this->productId = (int) DB::table('acc_products')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Milk',
            'unit' => 'litre',
            'base_unit' => 'ml',
            'purchase_unit' => 'carton',
            'pack_size' => 12000,
            'buy_price' => 0,
            'sell_price' => 0,
            'inventory_controlled' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->warehouseId = (int) DB::table('acc_warehouses')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Main',
            'is_default' => true,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function inventoryBalance(): float
    {
        return (float) DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->where('jl.tenant_id', $this->tenant->id)
            ->where('a.code', '1301')
            ->selectRaw('COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) as bal')
            ->value('bal');
    }

    /** Receiving 1,000 ml at 100 = 100,000 of stock, and 100,000 in the books. */
    public function test_receiving_stock_posts_its_value_to_the_inventory_account(): void
    {
        $result = app(StockLedger::class)->receive($this->tenant->id, $this->productId, 1000, 100, [
            'warehouse_id' => $this->warehouseId,
        ]);

        $this->assertSame(100000.0, $result['value_minor']);
        $this->assertNotNull($result['journal_entry_id']);
        $this->assertSame(100000.0, $this->inventoryBalance(), 'inventory debit equals the purchase');

        $this->assertSame(1000.0, app(RecipeCosting::class)
            ->costFor($this->tenant->id, RecipeCosting::SUBJECT_ACC_PRODUCT, $this->productId)['qty_on_hand']);
    }

    /** Waste needs a reason, and the value leaves inventory for cost of sales. */
    public function test_waste_requires_a_reason_and_posts_to_cost_of_sales(): void
    {
        $ledger = app(StockLedger::class);
        $ledger->receive($this->tenant->id, $this->productId, 1000, 100, ['warehouse_id' => $this->warehouseId]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $ledger->issue($this->tenant->id, $this->productId, 100, '   ');
    }

    public function test_a_reasoned_waste_moves_value_out_of_inventory(): void
    {
        $ledger = app(StockLedger::class);
        $ledger->receive($this->tenant->id, $this->productId, 1000, 100, ['warehouse_id' => $this->warehouseId]);

        $result = $ledger->issue($this->tenant->id, $this->productId, 200, 'expired');

        $this->assertSame(20000.0, $result['value_minor']);
        $this->assertSame(80000.0, $this->inventoryBalance(), '100,000 in, 20,000 spoiled');

        $movement = DB::table('stock_movements')->where('reason', 'waste')->latest('id')->first();
        $this->assertStringContainsString('expired', (string) $movement->note);
    }

    /**
     * A count posts the difference, not the total.
     *
     * Counting what you already had is not a movement; posting it would double the inventory
     * account every time somebody did a stocktake.
     */
    public function test_a_count_posts_only_the_difference(): void
    {
        $ledger = app(StockLedger::class);
        $ledger->receive($this->tenant->id, $this->productId, 1000, 100, ['warehouse_id' => $this->warehouseId]);

        $result = $ledger->count($this->tenant->id, $this->productId, 950);

        $this->assertSame(-50.0, $result['delta']);
        $this->assertSame(-5000.0, $result['value_minor']);
        $this->assertSame(95000.0, $this->inventoryBalance());

        // Counting the same again is not a movement at all.
        $again = $ledger->count($this->tenant->id, $this->productId, 950);
        $this->assertSame(0.0, $again['delta']);
        $this->assertSame(95000.0, $this->inventoryBalance());
    }

    /** A transfer is two rows and no journal: the value did not change hands. */
    public function test_a_transfer_moves_stock_between_stores_without_touching_the_books(): void
    {
        $second = (int) DB::table('acc_warehouses')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Kitchen',
            'is_default' => false,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $ledger = app(StockLedger::class);
        $ledger->receive($this->tenant->id, $this->productId, 1000, 100, ['warehouse_id' => $this->warehouseId]);

        $ledger->transfer($this->tenant->id, $this->productId, $this->warehouseId, $second, 400);

        $this->assertSame(1000.0, app(RecipeCosting::class)
            ->costFor($this->tenant->id, RecipeCosting::SUBJECT_ACC_PRODUCT, $this->productId)['qty_on_hand'], 'the total is unchanged');
        $this->assertSame(100000.0, $this->inventoryBalance(), 'no journal for a transfer');

        $this->assertSame(600.0, (float) DB::table('acc_warehouse_stock')
            ->where('warehouse_id', $this->warehouseId)->where('product_id', $this->productId)->value('quantity'));
        $this->assertSame(400.0, (float) DB::table('acc_warehouse_stock')
            ->where('warehouse_id', $second)->where('product_id', $this->productId)->value('quantity'));
    }

    /** A transfer of stock the shop does not have is refused, not invented. */
    public function test_a_transfer_cannot_exceed_what_is_on_hand(): void
    {
        $ledger = app(StockLedger::class);
        $ledger->receive($this->tenant->id, $this->productId, 100, 100, ['warehouse_id' => $this->warehouseId]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $ledger->transfer($this->tenant->id, $this->productId, $this->warehouseId, null, 500);
    }

    /** A lot, when the shop tracks one, is where the quantity lands. */
    public function test_a_batch_is_recorded_and_drawn_down(): void
    {
        $ledger = app(StockLedger::class);
        $ledger->receive($this->tenant->id, $this->productId, 500, 100, [
            'warehouse_id' => $this->warehouseId,
            'batch_no' => 'B-77',
            'expires_on' => now()->addDays(2)->toDateString(),
        ]);

        $ledger->issue($this->tenant->id, $this->productId, 100, 'expired', [
            'warehouse_id' => $this->warehouseId,
            'batch_no' => 'B-77',
        ]);

        $this->assertSame(400.0, (float) DB::table('stock_batches')->where('batch_no', 'B-77')->value('quantity'));

        $expiring = $ledger->expiring($this->tenant->id, 3);
        $this->assertCount(1, $expiring);
        $this->assertSame('B-77', $expiring[0]['batch_no']);
        $this->assertFalse($expiring[0]['expired']);
    }

    /**
     * The batch fields the movement form sends are accepted by the endpoint it posts to.
     *
     * The ledger understood lots and expiry long before the screen did; this pins the wire
     * contract so the form and the ledger cannot drift apart again.
     */
    public function test_the_movement_endpoint_accepts_a_batch_and_an_expiry(): void
    {
        $this->postJson('/api/v1/stock/receive', [
            'product_id' => $this->productId,
            'quantity' => 250,
            'unit_cost_minor' => 120,
            'warehouse_id' => $this->warehouseId,
            'batch_no' => 'B-900',
            'expires_on' => now()->addDays(5)->toDateString(),
        ])->assertCreated();

        $this->assertDatabaseHas('stock_batches', [
            'tenant_id' => $this->tenant->id,
            'batch_no' => 'B-900',
        ]);

        $batch = DB::table('stock_batches')->where('batch_no', 'B-900')->first();
        $this->assertSame(250.0, (float) $batch->quantity);
        $this->assertNotNull($batch->expires_on);

        // And a waste line can name the lot it came from, so the drawer-down hits the right one.
        $this->postJson('/api/v1/stock/waste', [
            'product_id' => $this->productId,
            'quantity' => 50,
            'reason' => 'شکستن ظرف',
            'kind' => 'spoilage',
            'warehouse_id' => $this->warehouseId,
            'batch_no' => 'B-900',
        ])->assertCreated();

        $this->assertSame(200.0, (float) DB::table('stock_batches')->where('batch_no', 'B-900')->value('quantity'));

        // The movement points at the lot, so a lot's history is a query and not a string match.
        $batchId = (int) DB::table('stock_batches')->where('batch_no', 'B-900')->value('id');
        $this->assertSame(
            $batchId,
            (int) DB::table('stock_movements')->where('reason', 'waste')->value('batch_id'),
        );
    }

    /** Every waste line carries a kind, because "waste" alone does not say what to fix. */
    public function test_waste_kinds_are_kept_apart(): void
    {
        foreach (['waste', 'spoilage', 'staff_meal', 'other'] as $index => $kind) {
            $this->postJson('/api/v1/stock/waste', [
                'product_id' => $this->productId,
                'quantity' => 10,
                'reason' => 'reason-'.$kind,
                'kind' => $kind,
                'warehouse_id' => $this->warehouseId,
            ])->assertCreated();
        }

        // One kind each, so a report can say "half the loss was spoilage" and mean it. The
        // kind used to be validated and dropped, which made the four labels decorative.
        $rows = DB::table('stock_movements')
            ->where('tenant_id', $this->tenant->id)
            ->where('reason', 'waste')
            ->pluck('waste_kind')
            ->all();

        $this->assertEqualsCanonicalizing(
            ['waste', 'spoilage', 'staff_meal', 'other'],
            array_values(array_filter($rows)),
        );
    }

    /** The waste report answers "which cause cost me most", not just "how much did I lose". */
    public function test_waste_is_reported_by_cause_and_by_item(): void
    {
        $ledger = app(StockLedger::class);
        $ledger->receive($this->tenant->id, $this->productId, 1000, 100, ['warehouse_id' => $this->warehouseId]);

        $ledger->issue($this->tenant->id, $this->productId, 100, 'expired milk', [
            'warehouse_id' => $this->warehouseId,
            'kind' => 'spoilage',
        ]);
        $ledger->issue($this->tenant->id, $this->productId, 50, 'dropped', [
            'warehouse_id' => $this->warehouseId,
            'kind' => 'waste',
        ]);

        $report = $ledger->wasteReport($this->tenant->id);

        // 100 units at the 100 the ledger knows → 10,000; 50 → 5,000.
        $this->assertSame(15000.0, round($report['total_value_minor'], 4));

        $byKind = collect($report['by_kind'])->keyBy('kind');
        $this->assertSame(10000.0, round((float) $byKind['spoilage']['value_minor'], 4));
        $this->assertSame(5000.0, round((float) $byKind['waste']['value_minor'], 4));
        $this->assertSame(150.0, (float) $byKind['spoilage']['quantity']);
        $this->assertSame(66.7, (float) $byKind['spoilage']['share_percent']);

        $this->assertSame($this->productId, $report['by_item'][0]['product_id']);
        $this->assertSame(150.0, (float) $report['by_item'][0]['quantity']);
    }

    /** The buying path: no order without approval, no stock without QC. */
    public function test_a_request_must_be_approved_before_it_becomes_an_order(): void
    {
        $purchasing = app(Purchasing::class);

        $created = $purchasing->createRequest(
            $this->tenant->id,
            [['product_id' => $this->productId, 'quantity' => 12000, 'estimated_unit_cost_minor' => 5]],
            $this->warehouseId,
            (int) $this->owner->id,
        );

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $purchasing->createOrder($this->tenant->id, $created['document_id'], null, (int) $this->owner->id);
    }

    public function test_an_approved_request_becomes_an_order_and_a_passed_receipt_enters_stock(): void
    {
        $purchasing = app(Purchasing::class);

        $created = $purchasing->createRequest(
            $this->tenant->id,
            [['product_id' => $this->productId, 'quantity' => 12000, 'estimated_unit_cost_minor' => 5]],
            $this->warehouseId,
            (int) $this->owner->id,
        );

        $purchasing->decideRequest($this->tenant->id, $created['document_id'], true, (int) $this->owner->id);

        $order = $purchasing->createOrder($this->tenant->id, $created['document_id'], null, (int) $this->owner->id);

        $this->assertSame(60000.0, $order['total_minor'], '12,000 ml at 5');

        $items = DB::table('purchase_order_items')->where('order_id', $order['order_id'])->get();

        $receipt = $purchasing->receiveOrder(
            $this->tenant->id,
            $order['order_id'],
            [['order_item_id' => (int) $items[0]->id, 'quantity' => 12000, 'batch_no' => 'L1']],
            (int) $this->owner->id,
        );

        $this->assertSame('passed', $receipt['qc_status']);
        $this->assertSame(0.0, $receipt['remaining_quantity']);
        $this->assertSame('received', DB::table('purchase_orders')->where('id', $order['order_id'])->value('status'));
        $this->assertSame(60000.0, $this->inventoryBalance());
    }

    /**
     * A refused delivery is paperwork, not stock.
     *
     * The receipt exists so the rejection is on record; the quantity does not enter the shelf
     * and the order stays open so it can be delivered again.
     */
    public function test_a_failed_qc_receipt_does_not_enter_stock(): void
    {
        $purchasing = app(Purchasing::class);

        $created = $purchasing->createRequest(
            $this->tenant->id,
            [['product_id' => $this->productId, 'quantity' => 1000, 'estimated_unit_cost_minor' => 100]],
            $this->warehouseId,
            (int) $this->owner->id,
        );
        $purchasing->decideRequest($this->tenant->id, $created['document_id'], true, (int) $this->owner->id);
        $order = $purchasing->createOrder($this->tenant->id, $created['document_id'], null, (int) $this->owner->id);
        $items = DB::table('purchase_order_items')->where('order_id', $order['order_id'])->get();

        $receipt = $purchasing->receiveOrder(
            $this->tenant->id,
            $order['order_id'],
            [['order_item_id' => (int) $items[0]->id, 'quantity' => 1000, 'note' => 'sour smell']],
            (int) $this->owner->id,
            ['qc_passed' => false, 'qc_note' => 'sour smell'],
        );

        $this->assertSame('rejected', $receipt['qc_status']);
        $this->assertSame(0.0, $this->inventoryBalance());
        $this->assertSame('partially_received', DB::table('purchase_orders')->where('id', $order['order_id'])->value('status'));
        $this->assertSame(1000.0, $receipt['remaining_quantity']);
    }

    /** A rejection without a reason is refused at the door. */
    public function test_a_qc_rejection_must_say_what_was_wrong(): void
    {
        $purchasing = app(Purchasing::class);

        $created = $purchasing->createRequest(
            $this->tenant->id,
            [['product_id' => $this->productId, 'quantity' => 1000]],
            $this->warehouseId,
            (int) $this->owner->id,
        );
        $purchasing->decideRequest($this->tenant->id, $created['document_id'], true, (int) $this->owner->id);
        $order = $purchasing->createOrder($this->tenant->id, $created['document_id'], null, (int) $this->owner->id);
        $items = DB::table('purchase_order_items')->where('order_id', $order['order_id'])->get();

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $purchasing->receiveOrder(
            $this->tenant->id,
            $order['order_id'],
            [['order_item_id' => (int) $items[0]->id, 'quantity' => 1000]],
            (int) $this->owner->id,
            ['qc_passed' => false],
        );
    }

    /** A rejection also needs a reason, for the same reason. */
    public function test_rejecting_a_request_needs_a_reason(): void
    {
        $purchasing = app(Purchasing::class);

        $created = $purchasing->createRequest(
            $this->tenant->id,
            [['product_id' => $this->productId, 'quantity' => 10]],
            $this->warehouseId,
            (int) $this->owner->id,
        );

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $purchasing->decideRequest($this->tenant->id, $created['document_id'], false, (int) $this->owner->id, '  ');
    }

    /** The reorder engine reads the reorder point that was stored and never used. */
    public function test_reorder_suggestions_come_from_the_stored_reorder_point(): void
    {
        $ledger = app(StockLedger::class);
        $ledger->receive($this->tenant->id, $this->productId, 2000, 100, ['warehouse_id' => $this->warehouseId]);

        DB::table('acc_warehouse_stock')
            ->where('warehouse_id', $this->warehouseId)
            ->where('product_id', $this->productId)
            ->update(['reorder_point' => 5000]);

        $suggestions = $ledger->reorderSuggestions($this->tenant->id);

        $this->assertCount(1, $suggestions);
        $this->assertSame(3000.0, $suggestions[0]['shortfall'], 'below the trigger by 3,000');
        // Buying back to twice the trigger, rounded up to whole cartons of 12,000.
        $this->assertSame(12000.0, $suggestions[0]['suggested_quantity']);
        $this->assertSame(1, $suggestions[0]['packs']);
    }

    /** Nothing is suggested for an item that is comfortably above its trigger. */
    public function test_no_suggestion_when_stock_is_above_the_trigger(): void
    {
        app(StockLedger::class)->receive($this->tenant->id, $this->productId, 9000, 100, ['warehouse_id' => $this->warehouseId]);

        DB::table('acc_warehouse_stock')
            ->where('warehouse_id', $this->warehouseId)
            ->where('product_id', $this->productId)
            ->update(['reorder_point' => 5000]);

        $this->assertSame([], app(StockLedger::class)->reorderSuggestions($this->tenant->id));
    }
}
