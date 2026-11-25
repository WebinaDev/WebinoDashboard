<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Tenant;
use App\Services\Reports\CafeReports;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Menu engineering must not call an uncosted dish a star.
 *
 * Two defects lived in one line of SQL:
 *
 *  - `SUM(CASE WHEN c.complete = 0 THEN 1 ELSE 0 END)` ran over a left join, so a sold line
 *    with **no** cost row (NULL, not 0) was never counted as incomplete — the worst case was
 *    the one the report could not see;
 *  - the quadrant means included those dishes, whose margin equals their whole selling price,
 *    dragging the average up and marking correctly-costed earners as dogs.
 */
class MenuEngineeringTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'menueng.test', 'slug' => 'me']);
    }

    /** A sold dish; `$frozenCost` null means the till wrote no cost row at all. */
    private function sold(string $name, int $price, ?int $frozenCost, float $qty = 1): Product
    {
        static $n = 0;
        $n++;

        $product = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'slug' => 'p'.$n.'-'.uniqid(),
            'price_minor' => $price,
            'currency' => 'IRT',
            'status' => 'publish',
            'type' => 'simple',
        ]);

        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'ME-'.$n.'-'.uniqid(),
            'status' => 'paid',
            'currency' => 'IRT',
            'subtotal_minor' => $price * $qty,
            'total_minor' => $price * $qty,
        ]);

        $item = OrderItem::query()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->id,
            'product_id' => $product->id,
            'product_name' => $name,
            'quantity' => $qty,
            'unit_price_minor' => $price,
        ]);

        if ($frozenCost !== null) {
            DB::table('order_item_ingredient_costs')->insert([
                'tenant_id' => $this->tenant->id,
                'order_item_id' => $item->id,
                'order_id' => $order->id,
                'unit_cost_minor' => $frozenCost,
                'quantity' => $qty,
                'total_cost_minor' => $frozenCost * $qty,
                'complete' => true,
                'breakdown' => json_encode([]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return $product;
    }

    private function report(): array
    {
        return app(CafeReports::class)->menuEngineering(
            (int) $this->tenant->id,
            now()->subDay(),
            now()->addDay(),
        );
    }

    /** A dish with no cost row is uncosted, not free. */
    public function test_a_line_with_no_cost_row_counts_as_uncosted(): void
    {
        $this->sold('لاته', 200_000, null);
        $this->sold('چای', 80_000, 20_000);

        $report = $this->report();

        $latte = collect($report['items'])->firstWhere('name', 'لاته');
        $tea = collect($report['items'])->firstWhere('name', 'چای');

        $this->assertFalse($latte['cost_known'], 'a missing cost row is the worst case, not a fine one');
        $this->assertSame(1, $latte['incomplete_lines']);
        $this->assertTrue($tea['cost_known']);
    }

    /** The summary says how much of the menu is flying blind. */
    public function test_the_summary_reports_uncosted_items(): void
    {
        $this->sold('لاته', 200_000, null);
        $this->sold('چای', 80_000, 20_000);

        $summary = $this->report()['summary'];

        $this->assertSame(1, $summary['uncosted_items']);
        $this->assertSame(200_000, (int) $summary['uncosted_revenue_minor']);
    }

    /**
     * The uncosted dish must not decide the quadrant line.
     *
     * Two costed dishes at a 40% margin with the same sales, plus one uncosted dish at a 100%
     * "margin". If the uncosted dish set the mean, both costed dishes would be labelled dogs.
     */
    public function test_an_uncosted_dish_does_not_reclassify_the_costed_ones(): void
    {
        $this->sold('آ', 100_000, 60_000);
        $this->sold('ب', 100_000, 60_000);
        $this->sold('بدون‌بها', 100_000, null);

        $report = $this->report();

        $a = collect($report['items'])->firstWhere('name', 'آ');
        $b = collect($report['items'])->firstWhere('name', 'ب');

        $this->assertNotSame('dog', $a['class'], 'a correctly costed dish must not be marked a dog');
        $this->assertNotSame('dog', $b['class']);
    }
}
