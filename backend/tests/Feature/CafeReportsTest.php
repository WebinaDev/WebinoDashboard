<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Services\Catalog\RecipeCosting;
use App\Services\Reports\CafeReports;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The reports that stand on the cost data.
 *
 * The P&L is the reason this exists: before it, revenue minus recorded expenses was presented
 * as profit with the entire cost of materials missing. Every number asserted here is checked
 * against an arithmetic done by hand in the comment above it.
 */
class CafeReportsTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private \App\Models\User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'reports.test', 'slug' => 'reports']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        $this->owner = \App\Models\User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
    }

    private function accProduct(string $name): int
    {
        return (int) DB::table('acc_products')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'buy_price' => 0,
            'sell_price' => 0,
            'inventory_controlled' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function dish(string $name, int $price, array $recipe = []): Product
    {
        $product = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'slug' => str()->slug($name).'-'.uniqid(),
            'price_minor' => $price,
            'currency' => 'IRT',
            'is_available' => true,
        ]);

        foreach ($recipe as $index => [$componentId, $quantity]) {
            DB::table('recipe_lines')->insert([
                'tenant_id' => $this->tenant->id,
                'subject_type' => 'product',
                'subject_id' => $product->id,
                'component_type' => 'acc_product',
                'component_id' => $componentId,
                'quantity' => $quantity,
                'waste_percent' => 0,
                'sort_order' => $index,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return $product;
    }

    /** Sell `$quantity` of a dish and return the order. */
    private function sell(Product $product, int $quantity, int $unitPrice, array $overrides = []): Order
    {
        $total = $quantity * $unitPrice;

        $order = Order::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'created_by' => $this->owner->id,
            'number' => 'RPT-'.uniqid(),
            'status' => 'completed',
            'subtotal_minor' => $total,
            'total_minor' => $total,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'tax_minor' => 0,
            'currency' => 'IRT',
        ], $overrides));

        $item = OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $product->id,
            'product_name' => $product->name,
            'quantity' => $quantity,
            'unit_price_minor' => $unitPrice,
            'total_minor' => $total,
        ]);

        app(RecipeCosting::class)->consumeOrderLine(
            $this->tenant->id,
            (int) $item->id,
            (int) $order->id,
            (int) $product->id,
            $quantity,
        );

        return $order;
    }

    /**
     * The core case: 10 lattes at 50,000 = 500,000 revenue, ingredients costing 150,000.
     * Gross profit is 350,000, and a 70% gross margin.
     */
    public function test_the_profit_and_loss_carries_a_real_material_cost(): void
    {
        $beans = $this->accProduct('Beans');
        app(RecipeCosting::class)->receive($this->tenant->id, 'acc_product', $beans, 1000, 100);

        // 150 g of beans per latte at 100/g = 15,000 a cup; 10 cups = 150,000.
        $latte = $this->dish('Latte', 50000, [[$beans, 150]]);
        $this->sell($latte, 10, 50000);

        $pl = app(CafeReports::class)->profitAndLoss($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertSame(500000, $pl['revenue']['net_minor']);
        $this->assertSame(150000, $pl['cost_of_sales']['material_minor']);
        $this->assertSame(350000, $pl['gross_profit_minor']);
        $this->assertSame(70.0, $pl['gross_margin_percent']);
        $this->assertSame(50000, $pl['average_ticket_minor']);
    }

    /** Delivery income is separated from trade so a free-delivery promo is visible, not silent. */
    public function test_delivery_revenue_is_reported_outside_net_sales(): void
    {
        $beans = $this->accProduct('Beans');
        app(RecipeCosting::class)->receive($this->tenant->id, 'acc_product', $beans, 1000, 0);
        $latte = $this->dish('Latte', 50000);

        $this->sell($latte, 1, 50000, ['shipping_minor' => 20000, 'subtotal_minor' => 50000, 'total_minor' => 70000]);

        $pl = app(CafeReports::class)->profitAndLoss($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertSame(20000, $pl['revenue']['delivery_minor']);
        $this->assertSame(50000, $pl['revenue']['net_minor'], 'delivery is income, not trade');
    }

    /** A cancelled order is not revenue. */
    public function test_cancelled_orders_are_excluded_from_revenue(): void
    {
        $latte = $this->dish('Latte', 50000);
        $this->sell($latte, 1, 50000);
        $this->sell($latte, 5, 50000, ['status' => 'cancelled']);

        $pl = app(CafeReports::class)->profitAndLoss($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertSame(1, $pl['revenue']['orders']);
        $this->assertSame(50000, $pl['revenue']['net_minor']);
    }

    /** Uncosted lines make the margin optimistic, and the report has to say so. */
    public function test_an_uncosted_line_is_flagged_in_the_profit_and_loss(): void
    {
        $unknown = $this->accProduct('Mystery Syrup');
        $dish = $this->dish('Mystery Cake', 40000, [[$unknown, 1]]);
        $this->sell($dish, 1, 40000);

        $pl = app(CafeReports::class)->profitAndLoss($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertFalse($pl['cost_of_sales']['complete']);
        $this->assertGreaterThan(0, $pl['cost_of_sales']['incomplete_lines']);
    }

    /** The four quadrants, against the mean popularity and the mean margin. */
    public function test_menu_engineering_classifies_items_into_quadrants(): void
    {
        $beans = $this->accProduct('Beans');
        app(RecipeCosting::class)->receive($this->tenant->id, 'acc_product', $beans, 100000, 10);

        // Star: sells a lot and carries a good margin.
        $star = $this->dish('Star', 100000, [[$beans, 100]]); // cost 1,000
        // Dog: sells a little with a thin margin.
        $dog = $this->dish('Dog', 20000, [[$beans, 1900]]); // cost 19,000

        $this->sell($star, 20, 100000);
        $this->sell($dog, 2, 20000);

        $report = app(CafeReports::class)->menuEngineering($this->tenant->id, now()->subDay(), now()->addDay());
        $byName = collect($report['items'])->keyBy('name');

        $this->assertSame('star', $byName['Star']['class']);
        $this->assertSame('dog', $byName['Dog']['class']);
        $this->assertSame(1, $report['summary']['counts']['star']);
        $this->assertSame(1, $report['summary']['counts']['dog']);
    }

    /** Voids, discounts and drawer shortfalls, attributed to the person who caused them. */
    public function test_the_control_report_attributes_discounts_and_variances_to_staff(): void
    {
        $latte = $this->dish('Latte', 50000);
        $this->sell($latte, 1, 50000, ['discount_minor' => 10000, 'total_minor' => 40000]);
        $this->sell($latte, 1, 50000, ['status' => 'cancelled']);

        $shift = \Modules\Cafe\Entities\CafeShift::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->owner->id,
            'status' => 'closed',
            'opening_float_minor' => 0,
            'counted_cash_minor' => 90000,
            'expected_cash_minor' => 100000,
            'variance_minor' => -10000,
            'counted_by' => $this->owner->id,
            'opened_at' => now()->subHours(4),
            'closed_at' => now()->subHour(),
        ]);
        $this->assertNotNull($shift->id);

        $report = app(CafeReports::class)->control($this->tenant->id, now()->subDay(), now()->addDay());
        $row = collect($report['staff'])->firstWhere('user_id', $this->owner->id);

        $this->assertNotNull($row);
        $this->assertSame(10000, $row['discounts_minor']);
        $this->assertSame(1, $row['discounted_orders']);
        $this->assertSame(1, $row['cancelled_orders']);
        $this->assertSame(10000, $row['short_minor'], 'a shortfall sits with whoever counted');
        $this->assertSame(-10000, $row['net_variance_minor']);
    }

    /** The CSV export opens correctly in Excel: BOM, headers, one row per record. */
    public function test_the_csv_export_is_utf8_and_quoted(): void
    {
        $latte = $this->dish('لاته, بزرگ', 50000);
        $this->sell($latte, 1, 50000);

        $response = $this->actingAs($this->owner, 'sanctum')
            ->get('/api/v1/reports/menu-engineering?format=csv');

        $response->assertOk();
        $body = $response->getContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $body, 'Excel needs the BOM to read Persian');
        // A comma inside a name must be quoted or it silently shifts every later column.
        $this->assertStringContainsString('"لاته, بزرگ"', $body);
    }

    /** AR aging buckets by days outstanding. */
    public function test_ar_aging_buckets_by_invoice_age(): void
    {
        $person = DB::table('acc_persons')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'مشتری الف',
            'type' => 'customer',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ([[10, 100000], [45, 200000], [100, 300000]] as [$daysAgo, $total]) {
            DB::table('accounting_invoices')->insert([
                'tenant_id' => $this->tenant->id,
                'person_id' => $person,
                'number' => 'INV-'.$daysAgo,
                'type' => 'sale',
                'status' => 'posted',
                'issue_date' => now()->subDays($daysAgo)->toDateString(),
                'subtotal_minor' => $total,
                'total_minor' => $total,
                'currency' => 'IRT',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $aging = app(CafeReports::class)->receivableAging($this->tenant->id);

        $this->assertSame(100000, $aging['buckets']['days_30']);
        $this->assertSame(200000, $aging['buckets']['days_60']);
        $this->assertSame(300000, $aging['buckets']['days_90']);
        $this->assertSame(600000, $aging['total_minor']);
        $this->assertSame(100, $aging['customers'][0]['oldest_days']);
    }

    /** Branch filtering must actually narrow the report. */
    public function test_reports_can_be_narrowed_to_one_branch(): void
    {
        $branch = DB::table('cafe_branches')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name_fa' => 'شعبه یک',
            'name_en' => 'Branch One',
            'slug' => 'branch-one',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $latte = $this->dish('Latte', 50000);
        $this->sell($latte, 1, 50000, ['branch_id' => $branch]);
        $this->sell($latte, 3, 50000);

        $all = app(CafeReports::class)->profitAndLoss($this->tenant->id, now()->subDay(), now()->addDay());
        $one = app(CafeReports::class)->profitAndLoss($this->tenant->id, now()->subDay(), now()->addDay(), $branch);

        $this->assertSame(4, $all['revenue']['orders']);
        $this->assertSame(1, $one['revenue']['orders'], 'the branch filter has to be applied, not just echoed');
    }

    /**
     * A posted payroll run feeds the P&L exactly once.
     *
     * The run is not posted to the ledger here, so the wage expense is not among the ledger
     * expenses and payroll must be added on top. Gross plus the employer's insurance is the
     * cost to the business: net pay alone would hide both the insurance and the withheld tax
     * the shop still pays over.
     */
    public function test_a_posted_payroll_run_is_counted_once_at_its_full_cost(): void
    {
        $latte = $this->dish('Latte', 50000);
        $this->sell($latte, 10, 50000);

        DB::table('cafe_payroll_runs')->insert([
            'tenant_id' => $this->tenant->id,
            'period_start' => now()->toDateString(),
            'period_end' => now()->toDateString(),
            'status' => 'posted',
            'gross_total_minor' => 30_000_000,
            'employee_insurance_total_minor' => 2_100_000,
            'employer_insurance_total_minor' => 6_900_000,
            'tax_total_minor' => 290_000,
            'net_total_minor' => 27_610_000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $pl = app(CafeReports::class)->profitAndLoss($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertSame(36_900_000, $pl['payroll_minor'], 'gross + employer insurance');
        $this->assertFalse($pl['payroll_in_ledger']);
        $this->assertSame(36_900_000, $pl['prime_cost_minor'], 'no material cost on an uncosted dish');
        $this->assertSame(500000 - 36_900_000, $pl['operating_profit_minor']);
    }

    /** A draft run is a plan, not a cost: only posted payroll reaches the P&L. */
    public function test_a_draft_payroll_run_is_not_a_cost_yet(): void
    {
        $latte = $this->dish('Latte', 50000);
        $this->sell($latte, 1, 50000);

        DB::table('cafe_payroll_runs')->insert([
            'tenant_id' => $this->tenant->id,
            'period_start' => now()->toDateString(),
            'period_end' => now()->toDateString(),
            'status' => 'draft',
            'gross_total_minor' => 30_000_000,
            'net_total_minor' => 27_610_000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $pl = app(CafeReports::class)->profitAndLoss($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertSame(0, $pl['payroll_minor']);
    }

    // --- service KPIs -------------------------------------------------------------------

    /** Mark every line of an order ready `$minutes` after it was taken. */
    private function readyAfter(Order $order, int $minutes): void
    {
        DB::table('cafe_order_item_prep')->insert([
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->id,
            'order_item_id' => DB::table('order_items')->where('order_id', $order->id)->value('id'),
            'status' => 'ready',
            'marked_at' => $order->created_at->copy()->addMinutes($minutes),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function table(string $code): void
    {
        DB::table('cafe_tables')->insertOrIgnore([
            'tenant_id' => $this->tenant->id,
            'code' => $code,
            'label' => $code,
            'seats' => 4,
            'is_active' => true,
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Order to serve averages over the lines that were actually ticked.
     *
     * Two tickets, 6 and 14 minutes: 10 minutes is the answer. The average is over lines and
     * not tickets because a ticket is only as fast as its slowest dish.
     */
    public function test_order_to_serve_is_measured_from_the_prep_ticks(): void
    {
        $latte = $this->dish('Latte', 50000);

        $this->readyAfter($this->sell($latte, 1, 50000), 6);
        $this->readyAfter($this->sell($latte, 1, 50000), 14);

        $kpi = app(CafeReports::class)->serviceKpis($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertSame(10.0, $kpi['service']['order_to_serve_minutes']);
        $this->assertSame(14, $kpi['service']['slowest_line_minutes']);
        $this->assertSame(2, $kpi['service']['lines_measured']);
    }

    /**
     * A kitchen that has ticked nothing has an unknown service time, not a perfect one.
     *
     * This is the assertion that keeps "0 minutes" out of a report an owner would read as
     * excellent rather than empty.
     */
    public function test_an_unticked_kitchen_reports_no_service_time_rather_than_zero(): void
    {
        $latte = $this->dish('Latte', 50000);
        $this->sell($latte, 1, 50000);

        $kpi = app(CafeReports::class)->serviceKpis($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertNull($kpi['service']['order_to_serve_minutes']);
        $this->assertSame(0, $kpi['service']['lines_measured']);
    }

    /**
     * One sitting per table per day, and dwell from the first order to the last.
     *
     * T1 is used at 10:00 and 10:40: one sitting, 40 minutes, not two. T2 at 12:00 is a second
     * sitting of zero minutes. Average dwell is 20 minutes; two sittings over two tables in one
     * day is a turnover of 1.0.
     */
    public function test_dwell_and_turnover_are_per_table_per_day(): void
    {
        $latte = $this->dish('Latte', 50000);
        $this->table('T1');
        $this->table('T2');

        $at = now()->setTime(10, 0);
        $this->sell($latte, 1, 50000, ['created_at' => $at->copy(), 'meta' => ['table_code' => 'T1']]);
        $this->sell($latte, 1, 50000, ['created_at' => $at->copy()->addMinutes(40), 'meta' => ['table_code' => 'T1']]);
        $this->sell($latte, 1, 50000, ['created_at' => $at->copy()->addHours(2), 'meta' => ['table_code' => 'T2']]);

        [$from, $to] = [now()->startOfDay(), now()->endOfDay()];
        $kpi = app(CafeReports::class)->serviceKpis($this->tenant->id, $from, $to);

        $this->assertSame(2, $kpi['tables']['sittings'], 'two orders at one table are one sitting');
        $this->assertSame(20.0, $kpi['tables']['table_dwell_minutes']);
        $this->assertSame(2, $kpi['tables']['active_tables']);
        $this->assertSame(1.0, $kpi['tables']['table_turnover']);
        $this->assertSame(1, $kpi['days']);
    }

    /**
     * Occupancy without a configured service day is unknown, not 0%.
     *
     * With 720 minutes open, one table and one 40-minute sitting, occupancy is 40/720 = 5.6%.
     */
    public function test_occupancy_needs_a_service_day_and_says_so_when_it_is_missing(): void
    {
        $latte = $this->dish('Latte', 50000);
        $this->table('T1');

        $at = now()->setTime(10, 0);
        $this->sell($latte, 1, 50000, ['created_at' => $at->copy(), 'meta' => ['table_code' => 'T1']]);
        $this->sell($latte, 1, 50000, ['created_at' => $at->copy()->addMinutes(40), 'meta' => ['table_code' => 'T1']]);

        [$from, $to] = [now()->startOfDay(), now()->endOfDay()];

        app(\Modules\Cafe\Services\OperationsSettings::class)->put($this->tenant->id, ['service_day_minutes' => 0]);
        \Illuminate\Support\Facades\Cache::flush();

        $off = app(CafeReports::class)->serviceKpis($this->tenant->id, $from, $to);
        $this->assertNull($off['tables']['occupancy_percent']);
        $this->assertSame(0, $off['tables']['service_day_minutes']);

        app(\Modules\Cafe\Services\OperationsSettings::class)->put($this->tenant->id, ['service_day_minutes' => 720]);
        \Illuminate\Support\Facades\Cache::flush();

        $on = app(CafeReports::class)->serviceKpis($this->tenant->id, $from, $to);
        $this->assertSame(5.6, $on['tables']['occupancy_percent'], '40 minutes over a 720-minute day');
    }

    /**
     * Break-even from the same margin the P&L reports.
     *
     * 500,000 of sales costs 150,000 in beans, so contribution is 70%. Rent of 210,000 is
     * covered by 300,000 of sales: 300,000 × 70% = 210,000.
     */
    public function test_break_even_is_derived_from_the_profit_and_loss_margin(): void
    {
        $beans = $this->accProduct('Beans');
        app(RecipeCosting::class)->receive($this->tenant->id, 'acc_product', $beans, 1000, 100);
        $latte = $this->dish('Latte', 50000, [[$beans, 150]]);
        $this->sell($latte, 10, 50000);

        $rent = DB::table('acc_chart_accounts')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'code' => '6102',
            'name' => 'اجاره',
            'type' => 'expense',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $entry = DB::table('acc_journal_entries')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'document_date' => now()->toDateString(),
            'status' => 'posted',
            'description' => 'rent',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('acc_journal_lines')->insert([
            'journal_entry_id' => $entry,
            'account_id' => $rent,
            'debit' => 210000,
            'credit' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $kpi = app(CafeReports::class)->serviceKpis($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertSame(70.0, $kpi['break_even']['contribution_percent']);
        $this->assertSame(210000, $kpi['break_even']['fixed_cost_minor']);
        $this->assertSame(300000, $kpi['break_even']['revenue_minor']);
        $this->assertTrue($kpi['break_even']['complete']);
    }

    /** No sales means no margin, and a break-even with no margin is not a number to show. */
    public function test_break_even_is_absent_without_sales(): void
    {
        $kpi = app(CafeReports::class)->serviceKpis($this->tenant->id, now()->subDay(), now()->addDay());

        $this->assertNull($kpi['break_even']['revenue_minor']);
        $this->assertFalse($kpi['break_even']['complete']);
    }
}
