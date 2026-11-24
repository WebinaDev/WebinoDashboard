<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Services\Catalog\RecipeCosting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Weighted-average costing, plate cost and ingredient consumption.
 *
 * The arithmetic here is what every margin report and the COGS line stand on, so the tests are
 * written against hand-computed numbers rather than the implementation's own output.
 */
class RecipeCostingTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private RecipeCosting $costing;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'recipe.test', 'slug' => 'recipe']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);

        $this->costing = app(RecipeCosting::class);
    }

    private function accProduct(string $name, float $buyPrice = 0): int
    {
        return (int) DB::table('acc_products')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'unit' => 'gram',
            'buy_price' => $buyPrice,
            'sell_price' => 0,
            'inventory_controlled' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function product(string $name, int $priceMinor = 100000): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'slug' => str()->slug($name).'-'.uniqid(),
            'price_minor' => $priceMinor,
            'currency' => 'IRT',
            'is_available' => true,
        ]);
    }

    /** The definition of a weighted average, checked by hand. */
    public function test_receiving_stock_moves_the_weighted_average(): void
    {
        $id = $this->accProduct('Beans');

        // 1000 g at 50 → average 50
        $this->costing->receive($this->tenant->id, 'acc_product', $id, 1000, 50);
        // 1000 g at 70 → (1000×50 + 1000×70) / 2000 = 60
        $result = $this->costing->receive($this->tenant->id, 'acc_product', $id, 1000, 70);

        $this->assertSame(60.0, $result['avg_cost_minor']);
        $this->assertSame(2000.0, $result['qty_on_hand']);

        $cost = $this->costing->costFor($this->tenant->id, 'acc_product', $id);
        $this->assertSame(60.0, $cost['avg_cost_minor']);
        $this->assertSame(70.0, $cost['last_cost_minor'], 'the last price is kept beside the average');
    }

    /** A heavier receipt at a different price must not be treated like a small one. */
    public function test_the_average_weighs_by_quantity_not_by_number_of_receipts(): void
    {
        $id = $this->accProduct('Milk');

        $this->costing->receive($this->tenant->id, 'acc_product', $id, 900, 40);
        // (900×40 + 100×200) / 1000 = 56, not (40+200)/2 = 120.
        $result = $this->costing->receive($this->tenant->id, 'acc_product', $id, 100, 200);

        $this->assertSame(56.0, $result['avg_cost_minor']);
    }

    /** A free sample should not drag the average toward zero. */
    public function test_a_zero_cost_receipt_leaves_the_average_alone(): void
    {
        $id = $this->accProduct('Cups');

        $this->costing->receive($this->tenant->id, 'acc_product', $id, 100, 30);
        $result = $this->costing->receive($this->tenant->id, 'acc_product', $id, 50, 0);

        $this->assertSame(30.0, $result['avg_cost_minor']);
        $this->assertSame(150.0, $result['qty_on_hand'], 'the quantity still arrives');
    }

    /** Plate cost: quantity × average cost, with waste added on top. */
    public function test_a_plate_cost_sums_its_ingredients_including_waste(): void
    {
        $beans = $this->accProduct('Beans');
        $milk = $this->accProduct('Milk');

        $this->costing->receive($this->tenant->id, 'acc_product', $beans, 1000, 100);
        $this->costing->receive($this->tenant->id, 'acc_product', $milk, 1000, 30);

        $latte = $this->product('Latte');

        DB::table('recipe_lines')->insert([
            // 18 g of beans at 100/g = 1800
            ['tenant_id' => $this->tenant->id, 'subject_type' => 'product', 'subject_id' => $latte->id,
                'component_type' => 'acc_product', 'component_id' => $beans, 'quantity' => 18,
                'waste_percent' => 0, 'unit' => 'gram', 'sort_order' => 1, 'created_at' => now(), 'updated_at' => now()],
            // 240 ml of milk at 30/ml = 7200, plus 10% waste = 7920
            ['tenant_id' => $this->tenant->id, 'subject_type' => 'product', 'subject_id' => $latte->id,
                'component_type' => 'acc_product', 'component_id' => $milk, 'quantity' => 240,
                'waste_percent' => 10, 'unit' => 'ml', 'sort_order' => 2, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $cost = $this->costing->plateCost($this->tenant->id, 'product', $latte->id);

        $this->assertSame(1800.0 + 7920.0, $cost['unit_cost_minor']);
        $this->assertTrue($cost['complete']);
        $this->assertSame([], $cost['missing']);
    }

    /** An ingredient with no cost is reported, never counted as free. */
    public function test_a_missing_ingredient_cost_is_reported_not_ignored(): void
    {
        $known = $this->accProduct('Sugar');
        $this->costing->receive($this->tenant->id, 'acc_product', $known, 100, 10);
        $unknown = $this->accProduct('Syrup'); // never purchased

        $dish = $this->product('Syrup Cake');
        DB::table('recipe_lines')->insert([
            ['tenant_id' => $this->tenant->id, 'subject_type' => 'product', 'subject_id' => $dish->id,
                'component_type' => 'acc_product', 'component_id' => $known, 'quantity' => 10,
                'waste_percent' => 0, 'sort_order' => 1, 'created_at' => now(), 'updated_at' => now()],
            ['tenant_id' => $this->tenant->id, 'subject_type' => 'product', 'subject_id' => $dish->id,
                'component_type' => 'acc_product', 'component_id' => $unknown, 'quantity' => 1,
                'waste_percent' => 0, 'sort_order' => 2, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $cost = $this->costing->plateCost($this->tenant->id, 'product', $dish->id);

        $this->assertFalse($cost['complete']);
        $this->assertCount(1, $cost['missing']);
        $this->assertSame(100.0, $cost['unit_cost_minor'], 'the known part is still costed');
    }

    /** A hand-typed cost is used while a purchase history does not exist yet. */
    public function test_a_hand_typed_purchase_price_is_the_fallback(): void
    {
        $flour = $this->accProduct('Flour', 75);
        $cake = $this->product('Bread');

        DB::table('recipe_lines')->insert([
            'tenant_id' => $this->tenant->id, 'subject_type' => 'product', 'subject_id' => $cake->id,
            'component_type' => 'acc_product', 'component_id' => $flour, 'quantity' => 2,
            'waste_percent' => 0, 'sort_order' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $cost = $this->costing->plateCost($this->tenant->id, 'product', $cake->id);

        $this->assertSame(150.0, $cost['unit_cost_minor']);
        $this->assertTrue($cost['complete']);
    }

    /** Consuming stock at the average cost, and leaving an auditable movement. */
    public function test_consuming_stock_writes_a_movement_at_the_average_cost(): void
    {
        $id = $this->accProduct('Beans');
        $this->costing->receive($this->tenant->id, 'acc_product', $id, 1000, 60);

        $value = $this->costing->consume($this->tenant->id, 'acc_product', $id, 250, 'waste', ['note' => 'spilled']);

        $this->assertSame(15000.0, $value, '250 × 60');
        $this->assertSame(750.0, $this->costing->costFor($this->tenant->id, 'acc_product', $id)['qty_on_hand']);

        $movement = DB::table('stock_movements')->where('reason', 'waste')->first();
        $this->assertNotNull($movement);
        $this->assertSame(-250.0, (float) $movement->quantity);
        $this->assertSame('spilled', $movement->note);
    }

    /** A physical count records the difference as a movement, not a silent rewrite. */
    public function test_a_count_adjusts_and_records_the_difference(): void
    {
        $id = $this->accProduct('Milk');
        $this->costing->receive($this->tenant->id, 'acc_product', $id, 1000, 30);

        $result = $this->costing->adjustToCount($this->tenant->id, 'acc_product', $id, 970);

        $this->assertSame(-30.0, $result['delta']);
        $this->assertSame(970.0, $result['qty_on_hand']);

        $movement = DB::table('stock_movements')->where('reason', 'count')->first();
        $this->assertSame(-30.0, (float) $movement->quantity);
    }

    /** Selling a dish withdraws its ingredients and freezes the line cost. */
    public function test_selling_a_dish_consumes_its_ingredients_and_freezes_the_cost(): void
    {
        $beans = $this->accProduct('Beans');
        $this->costing->receive($this->tenant->id, 'acc_product', $beans, 1000, 100);

        $dish = $this->product('Espresso', 30000);
        DB::table('recipe_lines')->insert([
            'tenant_id' => $this->tenant->id, 'subject_type' => 'product', 'subject_id' => $dish->id,
            'component_type' => 'acc_product', 'component_id' => $beans, 'quantity' => 20,
            'waste_percent' => 0, 'sort_order' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'REC-1',
            'status' => 'completed',
            'subtotal_minor' => 60000,
            'total_minor' => 60000,
            'currency' => 'IRT',
        ]);
        $item = OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $dish->id,
            'product_name' => 'Espresso',
            'quantity' => 2,
            'unit_price_minor' => 30000,
            'total_minor' => 60000,
        ]);

        $result = $this->costing->consumeOrderLine($this->tenant->id, (int) $item->id, (int) $order->id, (int) $dish->id, 2);

        // 2 × (20 g × 100) = 4000
        $this->assertSame(4000.0, $result['total_cost_minor']);
        $this->assertSame(960.0, $this->costing->costFor($this->tenant->id, 'acc_product', $beans)['qty_on_hand']);

        $frozen = DB::table('order_item_ingredient_costs')->where('order_item_id', $item->id)->first();
        $this->assertSame(2000.0, (float) $frozen->unit_cost_minor, 'cost per single unit');

        $cogs = $this->costing->cogsFor($this->tenant->id, now()->subHour(), now()->addHour());
        $this->assertSame(4000.0, $cogs['cogs_minor']);
    }

    /** A dish with no recipe falls back to its own typed cost instead of costing nothing. */
    public function test_a_dish_without_a_recipe_uses_its_typed_cost(): void
    {
        $cake = $this->product('Bought-in Cake', 50000);
        $cake->update(['purchase_price_minor' => 20000]);

        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'REC-2',
            'status' => 'completed',
            'subtotal_minor' => 50000,
            'total_minor' => 50000,
            'currency' => 'IRT',
        ]);
        $item = OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $cake->id,
            'product_name' => 'Bought-in Cake',
            'quantity' => 1,
            'unit_price_minor' => 50000,
            'total_minor' => 50000,
        ]);

        $result = $this->costing->consumeOrderLine($this->tenant->id, (int) $item->id, (int) $order->id, (int) $cake->id, 1);

        $this->assertSame(20000.0, $result['unit_cost_minor']);
    }

    /** A complete recipe becomes the product's cost; an incomplete one must not. */
    public function test_syncing_a_product_cost_refuses_an_incomplete_recipe(): void
    {
        $known = $this->accProduct('Beans');
        $this->costing->receive($this->tenant->id, 'acc_product', $known, 100, 50);
        $unknown = $this->accProduct('Vanilla');

        $dish = $this->product('Vanilla Latte', 80000);
        $dish->update(['purchase_price_minor' => 12000]);

        DB::table('recipe_lines')->insert([
            ['tenant_id' => $this->tenant->id, 'subject_type' => 'product', 'subject_id' => $dish->id,
                'component_type' => 'acc_product', 'component_id' => $unknown, 'quantity' => 1,
                'waste_percent' => 0, 'sort_order' => 1, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->costing->syncProductCost($this->tenant->id, (int) $dish->id);

        $this->assertSame(12000, (int) $dish->fresh()->purchase_price_minor, 'a partial roll-up must not overwrite a real cost');
    }
}
