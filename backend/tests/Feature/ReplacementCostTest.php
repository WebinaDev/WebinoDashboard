<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Catalog\RecipeCosting;
use App\Services\Reports\CafeReports;
use App\Services\Stock\StockLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Would the dish still earn what it earned?
 *
 * Historical margins are frozen at the moment of sale, which is what makes them trustworthy —
 * and also what makes them blind: a supplier's price rise does not appear in any past margin.
 * This report recomputes each dish at today's weighted average next to what it cost when sold.
 */
class ReplacementCostTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Product $dish;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'replacement.test', 'slug' => 'rc']);

        $this->actingAs(User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]), 'sanctum');

        $this->dish = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'لاته',
            'slug' => 'latte',
            'price_minor' => 200_000,
            'currency' => 'IRT',
            'status' => 'publish',
            'type' => 'simple',
        ]);
    }

    /** A sold plate, with its frozen cost line as the till would have written it. */
    private function soldDish(int $frozenUnitCost, float $qty = 1, ?Carbon $at = null): void
    {
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'RC-'.uniqid(),
            'status' => 'paid',
            'currency' => 'IRT',
            'subtotal_minor' => 200_000 * $qty,
            'total_minor' => 200_000 * $qty,
            'created_at' => $at ?? now(),
        ]);

        $item = OrderItem::query()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->id,
            'product_id' => $this->dish->id,
            'product_name' => 'لاته',
            'quantity' => $qty,
            'unit_price_minor' => 200_000,
        ]);

        DB::table('order_item_ingredient_costs')->insert([
            'tenant_id' => $this->tenant->id,
            'order_item_id' => $item->id,
            'order_id' => $order->id,
            'unit_cost_minor' => $frozenUnitCost,
            'quantity' => $qty,
            'total_cost_minor' => $frozenUnitCost * $qty,
            'complete' => true,
            'breakdown' => json_encode([]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** The recipe: 10 g of beans per cup, at a cost the stock ledger sets. */
    private function recipeAt(int $beanCostPerUnit): void
    {
        $beans = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'دانه قهوه',
            'slug' => 'beans-'.uniqid(),
            'price_minor' => 0,
            'currency' => 'IRT',
            'status' => 'publish',
            'type' => 'ingredient',
        ]);

        app(StockLedger::class)->receive(
            (int) $this->tenant->id,
            (int) $beans->id,
            1,
            (float) $beanCostPerUnit,
        );

        DB::table('recipe_lines')->insert([
            'tenant_id' => $this->tenant->id,
            'subject_type' => RecipeCosting::SUBJECT_PRODUCT,
            'subject_id' => $this->dish->id,
            'component_type' => RecipeCosting::SUBJECT_PRODUCT,
            'component_id' => $beans->id,
            'quantity' => 1,
            'waste_percent' => 0,
            'unit' => 'g',
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_a_rise_in_ingredient_cost_shows_up_against_the_frozen_cost(): void
    {
        $this->recipeAt(50_000);
        $this->soldDish(50_000);

        // The supplier raises the price: the same recipe now costs more to make.
        $this->recipeAt(80_000);

        $report = app(CafeReports::class)->replacementCost(
            (int) $this->tenant->id,
            now()->subDay(),
            now()->addDay(),
        );

        $this->assertCount(1, $report['items']);
        $row = $report['items'][0];

        $this->assertTrue($row['complete']);
        $this->assertSame(50_000, $row['historical_unit_cost_minor']);
        $this->assertSame(70_000, $row['replacement_unit_cost_minor'], 'the weighted average is now higher');
        $this->assertSame(20_000, $row['delta_minor']);
        $this->assertSame(40.0, $row['delta_percent']);
        $this->assertSame(1, $report['summary']['rising']);
    }

    /** A dish with an incomplete recipe is listed but never compared. */
    public function test_an_uncosted_dish_is_reported_not_guessed(): void
    {
        // No recipe at all: there is no replacement cost to compare against.
        $this->soldDish(50_000);

        $report = app(CafeReports::class)->replacementCost(
            (int) $this->tenant->id,
            now()->subDay(),
            now()->addDay(),
        );

        $this->assertSame(1, count($report['items']));
        $this->assertFalse($report['items'][0]['complete']);
        $this->assertNull($report['items'][0]['replacement_unit_cost_minor']);
        $this->assertSame(1, $report['summary']['incomplete_items']);
        $this->assertSame(0, $report['summary']['comparable_items']);
    }
}
