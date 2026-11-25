<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Tenant;
use App\Services\Catalog\RecipeCosting;
use App\Services\Stock\Production;
use App\Services\Stock\StockLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Making bread from flour: both halves of the stock movement, together.
 *
 * Before this existed a shop could record the output ("40 buns arrived") or the input ("10 kg
 * of flour left") but not the pair, so one side was always wrong: stock appeared from nowhere
 * for free, or the buns were never counted at all and got "found" at the next physical count.
 *
 * The assertions that matter here are about value, not quantity: the output must enter stock
 * at exactly what the inputs cost, or the ledger balances by luck.
 */
class ProductionTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private int $flourId;

    private int $bunId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'production.test', 'slug' => 'prod']);

        $this->flourId = $this->accProduct('آرد', 'kg');
        $this->bunId = $this->accProduct('نان', 'عدد');

        app(StockLedger::class)->receive($this->tenant->id, $this->flourId, 100, 50_000);

        // 10 kg of flour per batch of 40 buns, no waste.
        DB::table('recipe_lines')->insert([
            'tenant_id' => $this->tenant->id,
            'subject_type' => RecipeCosting::SUBJECT_ACC_PRODUCT,
            'subject_id' => $this->bunId,
            'component_type' => RecipeCosting::SUBJECT_ACC_PRODUCT,
            'component_id' => $this->flourId,
            'quantity' => 10,
            'waste_percent' => 0,
            'unit' => 'kg',
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function accProduct(string $name, string $unit): int
    {
        return (int) DB::table('acc_products')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            // `base_unit` arrives in a later migration; the original column is `unit`.
            'unit' => $unit,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function onHand(int $productId): float
    {
        return (float) DB::table('ingredient_costs')
            ->where('tenant_id', $this->tenant->id)
            ->where('subject_id', $productId)
            ->value('qty_on_hand');
    }

    private function unitCost(int $productId): float
    {
        return (float) DB::table('ingredient_costs')
            ->where('tenant_id', $this->tenant->id)
            ->where('subject_id', $productId)
            ->value('avg_cost_minor');
    }

    /** A draft plans; it does not move stock. */
    public function test_a_draft_writes_nothing(): void
    {
        $before = $this->onHand($this->flourId);

        $run = app(Production::class)->draft($this->tenant->id, $this->bunId, 40);

        $this->assertSame('draft', $run['status']);
        $this->assertSame($before, $this->onHand($this->flourId));
        $this->assertSame(0.0, $this->onHand($this->bunId));

        // 10 kg at 50,000 = 500,000 for 40 buns → 12,500 each.
        $this->assertSame(500_000.0, $run['input_value_minor']);
        $this->assertSame(12_500.0, $run['output_unit_cost_minor']);
    }

    /** Completing moves both sides and values the output at what the input cost. */
    public function test_completing_consumes_the_inputs_and_values_the_output(): void
    {
        $production = app(Production::class);
        $run = $production->draft($this->tenant->id, $this->bunId, 40);

        $done = $production->complete($this->tenant->id, $run['id']);

        $this->assertSame('completed', $done['status']);

        // Flour: 100 kg → 90 kg. Buns: 0 → 40.
        $this->assertSame(90.0, $this->onHand($this->flourId));
        $this->assertSame(40.0, $this->onHand($this->bunId));

        // And the value is the same on both sides: 500,000 left the flour, 500,000 arrived
        // as buns. A run that created or destroyed value here would unbalance the ledger.
        $this->assertSame(500_000.0, round(40 * $this->unitCost($this->bunId), 4));
    }

    /**
     * A made batch lands on the same shelf map as a bought one.
     *
     * The recipe says what goes in, never where the result belongs; without the slot the answer
     * to "where is the bread" existed for flour and not for what the shop made from it.
     */
    public function test_the_finished_batch_keeps_its_shelf_and_batch_label(): void
    {
        $production = app(Production::class);
        $run = $production->draft($this->tenant->id, $this->bunId, 40, [
            'batch_no' => 'B-1403-01',
            'slot' => 'قفسه B۲',
            'expires_on' => now()->addDays(3)->toDateString(),
        ]);

        $this->assertSame('قفسه B۲', $run['slot']);

        $done = $production->complete($this->tenant->id, $run['id']);
        $this->assertSame('قفسه B۲', $done['slot']);

        $batch = DB::table('stock_batches')
            ->where('tenant_id', $this->tenant->id)
            ->where('subject_id', $this->bunId)
            ->where('batch_no', 'B-1403-01')
            ->first();

        $this->assertNotNull($batch, 'the output batch must be recorded');
        $this->assertSame('قفسه B۲', $batch->slot, 'the shelf must reach the ledger, not just the UI');
    }

    /** A run is not repeatable: doing it twice would make the buns twice. */
    public function test_a_completed_run_cannot_run_again(): void
    {
        $production = app(Production::class);
        $run = $production->draft($this->tenant->id, $this->bunId, 40);
        $production->complete($this->tenant->id, $run['id']);

        $this->expectException(ValidationException::class);

        $production->complete($this->tenant->id, $run['id']);
    }

    /** No recipe means nothing to consume, so the output would be stock from nowhere. */
    public function test_a_product_without_a_recipe_is_refused(): void
    {
        $other = $this->accProduct('بی‌رسپی', 'عدد');

        $this->expectException(ValidationException::class);

        app(Production::class)->draft($this->tenant->id, $other, 10);
    }

    /** Producing more than the recipe states scales the inputs. */
    public function test_a_larger_run_consumes_proportionally_more(): void
    {
        $production = app(Production::class);
        $run = $production->draft($this->tenant->id, $this->bunId, 80);

        $this->assertSame(1000_000.0, $run['input_value_minor'], '80 buns need 20 kg, not 10');
        $this->assertSame(12_500.0, $run['output_unit_cost_minor'], 'the unit cost is unchanged by scale');

        $production->complete($this->tenant->id, $run['id']);

        $this->assertSame(80.0, $this->onHand($this->flourId));
    }

    /** Production is not waste: the two are reported apart. */
    public function test_production_does_not_appear_as_waste(): void
    {
        $production = app(Production::class);
        $run = $production->draft($this->tenant->id, $this->bunId, 40);
        $production->complete($this->tenant->id, $run['id']);

        $waste = app(StockLedger::class)->wasteReport($this->tenant->id);

        $this->assertSame(0.0, round($waste['total_value_minor'], 4), 'a bake is not spoilage');

        $this->assertTrue(
            DB::table('stock_movements')
                ->where('tenant_id', $this->tenant->id)
                ->where('reason', 'production')
                ->exists(),
        );
    }

    /** An uncosted ingredient makes the run a floor, and says so. */
    public function test_an_uncosted_component_is_reported(): void
    {
        $yeast = $this->accProduct('مایه', 'g');

        DB::table('ingredient_costs')->insert([
            'tenant_id' => $this->tenant->id,
            'subject_type' => RecipeCosting::SUBJECT_ACC_PRODUCT,
            'subject_id' => $yeast,
            'avg_cost_minor' => 0,
            'qty_on_hand' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // A recipe line whose component has no cost row at all.
        $missing = $this->accProduct('نمک', 'g');
        DB::table('recipe_lines')->insert([
            'tenant_id' => $this->tenant->id,
            'subject_type' => RecipeCosting::SUBJECT_ACC_PRODUCT,
            'subject_id' => $this->bunId,
            'component_type' => RecipeCosting::SUBJECT_ACC_PRODUCT,
            'component_id' => $missing,
            'quantity' => 1,
            'waste_percent' => 0,
            'unit' => 'g',
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $run = app(Production::class)->draft($this->tenant->id, $this->bunId, 40);

        $this->assertFalse($run['cost_complete'], 'an unpriced ingredient must not read as a fact');
    }
}
