<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Reports\OrderReports;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderReportsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected int $from;

    protected int $to;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        $this->enableSubmodules($this->tenant->id, [
            'analytics.overview' => true,
            'analytics.reports' => true,
            'commerce.catalog' => true,
            'commerce.orders' => true,
        ]);
        $this->admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->from = now()->subDays(2)->timestamp;
        $this->to = now()->addDay()->timestamp;
    }

    private function product(array $extra = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'P',
            'slug' => 'p-'.uniqid(),
            'price_minor' => 100000,
            'purchase_price_minor' => 40000,
            'currency' => 'IRR',
            'status' => 'publish',
            'is_available' => true,
            'stock' => 10,
            'stock_status' => 'instock',
            'manage_stock' => true,
        ], $extra));
    }

    private function order(Product $product, array $extra = [], int $qty = 1): Order
    {
        $unit = (int) $product->price_minor;
        $order = Order::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'number' => 'ORD-'.uniqid(),
            'status' => 'paid',
            'subtotal_minor' => $unit * $qty,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'total_minor' => $unit * $qty,
            'currency' => 'IRR',
            'customer_name' => 'Buyer',
        ], $extra));
        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'quantity' => $qty,
            'unit_price_minor' => $unit,
        ]);

        return $order;
    }

    private function qs(array $params = []): string
    {
        return http_build_query(array_merge(['from' => $this->from, 'to' => $this->to], $params));
    }

    public function test_sales_statuses_exclude_unpaid_and_review_statuses(): void
    {
        $statuses = OrderReports::salesStatuses();
        $this->assertContains('webino-packaged', $statuses);
        $this->assertContains('paid', $statuses);
        foreach (['webino-returned', 'webino-deleted', 'webino-need-review', 'cancelled', 'refunded', 'pending_payment'] as $excluded) {
            $this->assertNotContains($excluded, $statuses);
        }
    }

    public function test_overview_counts_custom_status_refunds_tax_heatmap_and_compare(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $p = $this->product(['name' => 'Espresso']);
        $this->order($p, ['status' => 'webino-packaged', 'tax_minor' => 9000, 'meta' => [
            'tax_lines' => [['name' => 'VAT', 'code' => 'VAT', 'rate' => 9, 'order_tax' => 9000, 'shipping_tax' => 0]],
        ]]);
        $paid = $this->order($p, ['status' => 'paid', 'tax_minor' => 1000]);
        $this->order($p, ['status' => 'webino-need-review']);
        $this->order($p, ['status' => 'refunded', 'total_minor' => 50000]);
        OrderReturn::query()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $paid->id,
            'status' => 'approved',
            'refund_minor' => 20000,
        ]);

        $data = $this->getJson('/api/v1/reports/overview?'.$this->qs(['compare' => 1]))
            ->assertOk()->json('data');

        $this->assertSame(2, (int) $data['summary']['order_count']);
        $this->assertSame(200000, (int) $data['summary']['revenue']);
        $this->assertSame(10000, (int) $data['summary']['tax_total']);
        $this->assertSame(70000, (int) $data['summary']['refunds']);
        $this->assertSame(2, (int) $data['summary']['refund_count']);
        $this->assertSame(130000, (int) $data['summary']['net_revenue']);
        $this->assertCount(168, $data['heatmap']);
        $this->assertCount(24, $data['by_hour']);
        $this->assertSame(2, array_sum(array_column($data['heatmap'], 'orders')));
        $this->assertArrayHasKey('compare', $data);
        foreach (['from', 'to', 'from_date', 'to_date', 'summary', 'series'] as $k) {
            $this->assertArrayHasKey($k, $data['compare']);
        }
        $statuses = array_column($data['by_status'], 'count', 'status');
        $this->assertSame(1, $statuses['webino-packaged']);
        $this->assertArrayHasKey('title', $data['by_payment'][0]);
        $this->assertArrayHasKey('margin_pct', $data['by_payment'][0]);
        $tiers = array_column($data['by_price_tier'], 'count', 'tier');
        $this->assertSame(2, $tiers['retail']);

        $taxes = $this->getJson('/api/v1/reports/taxes?'.$this->qs())->assertOk()->json('data');
        $this->assertSame(1, $taxes['total']);
        $this->assertSame(9000, (int) $taxes['items'][0]['total']);
    }

    public function test_new_vs_returning_customers(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $p = $this->product();
        $old = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $fresh = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $prior = $this->order($p, ['user_id' => $old->id, 'status' => 'cancelled']);
        $prior->forceFill(['created_at' => now()->subDays(30)])->save();
        $this->order($p, ['user_id' => $old->id]);
        $this->order($p, ['user_id' => $fresh->id]);

        $data = $this->getJson('/api/v1/reports/customers?'.$this->qs())->assertOk()->json('data');
        $this->assertSame(1, (int) $data['summary']['new_customers']);
        $this->assertSame(1, (int) $data['summary']['returning_customers']);
        $types = array_column($data['items'], 'type', 'id');
        $this->assertSame('returning', $types[$old->id]);
        $this->assertSame('new', $types[$fresh->id]);
    }

    public function test_products_list_pagination_sort_and_brands(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $brand = Brand::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'Lavazza', 'slug' => 'lavazza']);
        $cheap = $this->product(['name' => 'Cheap', 'price_minor' => 10000, 'purchase_price_minor' => 5000]);
        $mid = $this->product(['name' => 'Mid', 'price_minor' => 50000, 'purchase_price_minor' => 10000]);
        $top = $this->product(['name' => 'Top', 'price_minor' => 90000, 'purchase_price_minor' => 10000]);
        $top->brands()->attach($brand->id);
        $this->order($cheap, [], 5);
        $this->order($mid);
        $this->order($top);

        $page1 = $this->getJson('/api/v1/reports/products?'.$this->qs(['per_page' => 2]))->assertOk()->json('data');
        $this->assertSame(3, $page1['total']);
        $this->assertSame(2, $page1['per_page']);
        $this->assertCount(2, $page1['items']);
        $this->assertSame('Top', $page1['items'][0]['name']);
        foreach (['id', 'name', 'quantity', 'avg_sell_price', 'avg_cost', 'revenue', 'cogs', 'profit', 'margin_pct', 'missing_cost_qty'] as $k) {
            $this->assertArrayHasKey($k, $page1['items'][0]);
        }

        $page2 = $this->getJson('/api/v1/reports/products?'.$this->qs(['per_page' => 2, 'page' => 2]))->assertOk()->json('data');
        $this->assertCount(1, $page2['items']);

        $byQty = $this->getJson('/api/v1/reports/products?'.$this->qs(['orderby' => 'quantity', 'order' => 'desc']))->assertOk()->json('data');
        $this->assertSame('Cheap', $byQty['items'][0]['name']);

        $search = $this->getJson('/api/v1/reports/products?'.$this->qs(['search' => 'mid']))->assertOk()->json('data');
        $this->assertSame(1, $search['total']);

        $brands = $this->getJson('/api/v1/reports/brands?'.$this->qs())->assertOk()->json('data');
        $this->assertSame('Lavazza', $brands['items'][0]['name']);

        $sales = $this->getJson('/api/v1/reports/sales?'.$this->qs())->assertOk()->json('data');
        $this->assertSame('Top', $sales['items'][0]['name']);
        $this->assertArrayHasKey('by_price_tier', $sales);
    }

    public function test_financial_utm_breakdown_and_drill(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $p = $this->product();
        $this->order($p, ['utm_source' => 'google', 'utm_medium' => 'cpc', 'utm_campaign' => 'spring', 'payment_provider' => 'zarinpal']);
        $this->order($p, ['utm_source' => 'google', 'utm_medium' => 'cpc', 'utm_campaign' => 'spring', 'payment_provider' => 'zarinpal']);
        $this->order($p, ['payment_provider' => 'cod']);

        $data = $this->getJson('/api/v1/reports/financial?'.$this->qs())->assertOk()->json('data');
        $sources = array_column($data['by_utm_source'], 'count', 'value');
        $this->assertSame(2, $sources['google']);
        $this->assertSame(1, $sources['']);
        $this->assertSame('google', $data['by_utm'][0]['utm_source']);
        $this->assertSame(3, $data['orders_filtered']['total']);

        $drill = $this->getJson('/api/v1/reports/financial?'.$this->qs(['utm_source' => 'google']))->assertOk()->json('data');
        $this->assertSame(2, $drill['orders_filtered']['total']);
        $this->assertSame('google', $drill['orders_filtered']['items'][0]['utm_source']);

        $byPay = $this->getJson('/api/v1/reports/financial?'.$this->qs(['payment_method' => 'cod']))->assertOk()->json('data');
        $this->assertSame(1, $byPay['orders_filtered']['total']);
    }

    public function test_stock_filter_lowstock_and_category(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $cat = Category::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'Beans', 'slug' => 'beans']);
        $this->product(['name' => 'Low Bean', 'stock' => 2, 'category_id' => $cat->id]);
        $this->product(['name' => 'Low Other', 'stock' => 1]);
        $this->product(['name' => 'Full Bean', 'stock' => 50, 'category_id' => $cat->id]);

        $low = $this->getJson('/api/v1/reports/stock?stock_filter=lowstock')->assertOk()->json('data');
        $names = array_column($low['items'], 'name');
        $this->assertEqualsCanonicalizing(['Low Bean', 'Low Other'], $names);
        $this->assertSame(2, $low['summary']['low_stock_threshold']);
        $this->assertSame('IRR', $low['currency']);

        $lowCat = $this->getJson("/api/v1/reports/stock?filter=low&category={$cat->id}")->assertOk()->json('data');
        $this->assertSame(['Low Bean'], array_column($lowCat['items'], 'name'));

        $cat2 = $this->getJson("/api/v1/reports/stock?category={$cat->id}&orderby=stock_qty&order=desc")->assertOk()->json('data');
        $this->assertSame('Full Bean', $cat2['items'][0]['name']);
        $this->assertSame(25, $cat2['per_page']);
        foreach (['purchase', 'regular', 'sale', 'current', 'retail', 'credit', 'wholesale', 'installment'] as $k) {
            $this->assertArrayHasKey($k, $cat2['items'][0]['prices']);
        }
        $this->assertArrayHasKey('wholesale', $cat2['items'][0]['values']);
    }

    public function test_csv_exports_start_with_bom(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $p = $this->product(['name' => 'Espresso']);
        $this->order($p);

        foreach (['overview', 'financial', 'products', 'revenue', 'stock'] as $section) {
            $csv = $this->get("/api/v1/reports/{$section}/export?".$this->qs())->assertOk()->streamedContent();
            $this->assertStringStartsWith("\xEF\xBB\xBF", $csv, $section);
        }

        $overview = $this->get('/api/v1/reports/overview/export?'.$this->qs())->streamedContent();
        $this->assertStringContainsString('Metric,Value', $overview);
        $this->assertStringContainsString('Top products by profit', $overview);
        $this->assertStringContainsString('Heatmap', $overview);

        $products = $this->get('/api/v1/reports/products/export?'.$this->qs())->streamedContent();
        $this->assertStringContainsString('avg_sell_price', $products);
        $this->assertStringContainsString('Espresso', $products);
    }

    public function test_customer_role_gets_403(): void
    {
        $customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $this->actingAs($customer, 'sanctum');

        $this->getJson('/api/v1/reports/overview?'.$this->qs())->assertForbidden();
        $this->get('/api/v1/reports/stock/export')->assertForbidden();
    }
}
