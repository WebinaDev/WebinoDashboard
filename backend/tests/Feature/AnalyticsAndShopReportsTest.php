<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Analytics\AnalyticsRollup;
use App\Services\Analytics\AnalyticsSettings;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AnalyticsAndShopReportsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop', 'slug' => 'shop', 'domain' => 'shop.test', 'license_key' => 'k',
            'setup_completed' => true, 'store_display_name' => 'Shop', 'default_currency' => 'IRR',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'analytics.overview' => true,
            'analytics.reports' => true,
            'commerce.catalog' => true,
            'commerce.orders' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    public function test_public_hit_creates_pageview_and_respects_exclusions(): void
    {
        $settings = AnalyticsSettings::get($this->tenant->id);
        $token = (string) $settings['hit_token'];
        $this->assertNotSame('', $token);

        $ok = $this->postJson('/api/v1/public/analytics/hit', [
            'type' => 'pageview',
            'uri' => '/products/coffee',
            'referrer' => 'https://google.com/',
            'session_id' => 'sess1',
        ], [
            'X-Tenant-Domain' => 'shop.test',
            'X-Analytics-Token' => $token,
            'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        ])->assertOk();

        $this->assertTrue((bool) $ok->json('data.ok'));
        $this->assertNull($ok->json('data.skipped'));
        $this->assertSame(1, DB::table('analytics_events')->where('tenant_id', $this->tenant->id)->count());

        // Excluded URL path from defaults (/dashboard)
        $this->postJson('/api/v1/public/analytics/hit', [
            'type' => 'pageview',
            'uri' => '/dashboard/orders',
            'session_id' => 'sess2',
        ], [
            'X-Tenant-Domain' => 'shop.test',
            'X-Analytics-Token' => $token,
            'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        ])->assertOk()->assertJsonPath('data.skipped', 'url');

        $this->assertSame(1, DB::table('analytics_events')->where('tenant_id', $this->tenant->id)->count());

        AnalyticsSettings::save($this->tenant->id, ['tracking_enabled' => false]);
        $this->postJson('/api/v1/public/analytics/hit', [
            'type' => 'pageview',
            'uri' => '/about',
            'session_id' => 'sess3',
        ], [
            'X-Tenant-Domain' => 'shop.test',
            'X-Analytics-Token' => $token,
            'User-Agent' => 'Mozilla/5.0 Chrome/120.0.0.0',
        ])->assertStatus(403);
    }

    public function test_rollup_fills_daily_totals(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $tz = app(AnalyticsRollup::class)->timezone();
        $day = Carbon::now($tz)->format('Y-m-d');
        [$start] = app(AnalyticsRollup::class)->gmtBounds($day, $day);

        DB::table('analytics_events')->insert([
            'tenant_id' => $this->tenant->id,
            'created_at' => $start,
            'visitor_hash' => hash('sha256', 'a'),
            'uri' => '/home',
            'post_id' => 0,
            'referrer' => '',
            'ref_category' => 'direct',
            'ref_source' => '',
            'country' => 'IR',
            'city' => '',
            'browser' => 'Chrome',
            'os' => 'Windows',
            'device' => 'desktop',
            'utm_source' => '',
            'utm_medium' => '',
            'utm_campaign' => '',
            'session_id' => 's1',
            'duration_ms' => 0,
            'is_exit' => false,
            'is_bounce' => false,
        ]);
        DB::table('analytics_events')->insert([
            'tenant_id' => $this->tenant->id,
            'created_at' => $start,
            'visitor_hash' => hash('sha256', 'b'),
            'uri' => '/home',
            'post_id' => 0,
            'referrer' => '',
            'ref_category' => 'direct',
            'ref_source' => '',
            'country' => 'IR',
            'city' => '',
            'browser' => 'Firefox',
            'os' => 'Linux',
            'device' => 'desktop',
            'utm_source' => '',
            'utm_medium' => '',
            'utm_campaign' => '',
            'session_id' => 's2',
            'duration_ms' => 0,
            'is_exit' => false,
            'is_bounce' => false,
        ]);

        app(AnalyticsRollup::class)->rollupDay($this->tenant->id, $day);

        $row = DB::table('analytics_daily_totals')
            ->where('tenant_id', $this->tenant->id)
            ->where('day', $day)
            ->first();
        $this->assertNotNull($row);
        $this->assertSame(2, (int) $row->views);
        $this->assertSame(2, (int) $row->visitors);

        $this->getJson('/api/v1/analytics/overview')->assertOk()
            ->assertJsonPath('data.source', 'native');
    }

    public function test_settings_hide_hit_token(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $public = $this->getJson('/api/v1/analytics/settings')->assertOk()->json('data.settings');
        $this->assertArrayNotHasKey('hit_token', $public);
        $this->assertArrayNotHasKey('daily_salt', $public);

        $boot = $this->getJson('/api/v1/public/analytics/bootstrap', [
            'X-Tenant-Domain' => 'shop.test',
        ])->assertOk()->json('data');
        $this->assertTrue($boot['tracking_enabled']);
        $this->assertNotEmpty($boot['hit_token']);
    }

    public function test_shop_reports_revenue_excludes_cancelled_and_csv_has_headers(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $product = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Espresso',
            'slug' => 'espresso',
            'price_minor' => 100000,
            'purchase_price_minor' => 40000,
            'currency' => 'IRR',
            'status' => 'publish',
            'is_available' => true,
            'stock' => 3,
            'stock_status' => 'instock',
            'manage_stock' => true,
        ]);

        $paid1 = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'WD-1',
            'status' => 'paid',
            'subtotal_minor' => 100000,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'total_minor' => 100000,
            'currency' => 'IRR',
            'customer_name' => 'A',
        ]);
        $paid1->items()->create([
            'product_id' => $product->id,
            'product_name' => 'Espresso',
            'quantity' => 1,
            'unit_price_minor' => 100000,
        ]);

        $paid2 = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'WD-2',
            'status' => 'completed',
            'subtotal_minor' => 200000,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'total_minor' => 200000,
            'currency' => 'IRR',
            'customer_name' => 'B',
        ]);
        $paid2->items()->create([
            'product_id' => $product->id,
            'product_name' => 'Espresso',
            'quantity' => 2,
            'unit_price_minor' => 100000,
        ]);

        Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'WD-3',
            'status' => 'cancelled',
            'subtotal_minor' => 500000,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'total_minor' => 500000,
            'currency' => 'IRR',
            'customer_name' => 'C',
        ])->items()->create([
            'product_id' => $product->id,
            'product_name' => 'Espresso',
            'quantity' => 5,
            'unit_price_minor' => 100000,
        ]);

        $from = now()->subDay()->timestamp;
        $to = now()->addDay()->timestamp;
        $data = $this->getJson("/api/v1/reports/revenue?from={$from}&to={$to}")
            ->assertOk()
            ->json('data');

        $this->assertSame(300000, (int) $data['summary']['revenue']);
        $this->assertSame(2, (int) $data['summary']['order_count']);
        // COGS: 40000 * (1+2) = 120000; profit = 300000 - 120000
        $this->assertSame(120000, (int) $data['summary']['cogs']);
        $this->assertSame(180000, (int) $data['summary']['gross_profit']);

        $csv = $this->get("/api/v1/reports/revenue/export?from={$from}&to={$to}")
            ->assertOk()
            ->streamedContent();
        $this->assertStringContainsString('key', $csv);
        $this->assertStringContainsString('revenue', $csv);
    }

    public function test_stock_report_includes_low_stock(): void
    {
        $this->actingAs($this->user, 'sanctum');
        Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Low Bean',
            'slug' => 'low-bean',
            'price_minor' => 50000,
            'purchase_price_minor' => 20000,
            'currency' => 'IRR',
            'status' => 'publish',
            'is_available' => true,
            'stock' => 2,
            'stock_status' => 'instock',
            'manage_stock' => true,
        ]);
        Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Full Bean',
            'slug' => 'full-bean',
            'price_minor' => 50000,
            'purchase_price_minor' => 20000,
            'currency' => 'IRR',
            'status' => 'publish',
            'is_available' => true,
            'stock' => 50,
            'stock_status' => 'instock',
            'manage_stock' => true,
        ]);

        $all = $this->getJson('/api/v1/reports/stock')->assertOk()->json('data');
        $this->assertGreaterThanOrEqual(1, (int) $all['summary']['low_stock_count']);

        $low = $this->getJson('/api/v1/reports/stock?filter=low')->assertOk()->json('data');
        $names = array_column($low['items'], 'name');
        $this->assertContains('Low Bean', $names);
        $this->assertNotContains('Full Bean', $names);
    }
}
