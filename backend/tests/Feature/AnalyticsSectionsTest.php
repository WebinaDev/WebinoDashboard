<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Analytics\AnalyticsQuery;
use App\Services\Analytics\AnalyticsRollup;
use App\Services\Analytics\AnalyticsSettings;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AnalyticsSectionsTest extends TestCase
{
    use RefreshDatabase;

    private const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

    protected Tenant $tenant;

    protected User $admin;

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
        $this->admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    /** @param  array<string, mixed>  $overrides */
    private function event(array $overrides = []): void
    {
        DB::table('analytics_events')->insert(array_merge([
            'tenant_id' => $this->tenant->id,
            'created_at' => Carbon::now('UTC')->format('Y-m-d H:i:s'),
            'visitor_hash' => hash('sha256', 'a'),
            'uri' => '/',
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
            'session_id' => '',
            'duration_ms' => 0,
            'is_exit' => false,
            'is_bounce' => false,
            'event_type' => 'pageview',
        ], $overrides));
    }

    private function order(string $number, int $total, ?Carbon $createdAt = null, string $status = 'paid', string $utm = ''): Order
    {
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => $number,
            'status' => $status,
            'subtotal_minor' => $total,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'total_minor' => $total,
            'currency' => 'IRR',
            'customer_name' => 'C '.$number,
            'customer_email' => strtolower($number).'@example.test',
            'utm_source' => $utm,
        ]);
        if ($createdAt) {
            $order->created_at = $createdAt;
            $order->save();
        }

        return $order;
    }

    private function product(string $name): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'slug' => strtolower(str_replace(' ', '-', $name)),
            'price_minor' => 100000,
            'currency' => 'IRR',
            'status' => 'publish',
            'is_available' => true,
            'stock' => 5,
            'stock_status' => 'instock',
            'manage_stock' => true,
        ]);
    }

    private function range(): string
    {
        return 'from='.(time() - 86400).'&to='.(time() + 60);
    }

    public function test_commerce_funnel_counts_and_top_products(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $espresso = $this->product('Espresso');
        $latte = $this->product('Latte');

        foreach (['a', 'b', 'c'] as $v) {
            $this->event(['visitor_hash' => hash('sha256', $v)]);
        }
        $this->event(['visitor_hash' => hash('sha256', 'a'), 'event_type' => 'product_view', 'post_id' => $espresso->id]);
        $this->event(['visitor_hash' => hash('sha256', 'a'), 'event_type' => 'product_view', 'post_id' => $espresso->id]);
        $this->event(['visitor_hash' => hash('sha256', 'b'), 'event_type' => 'product_view', 'post_id' => $latte->id]);
        $this->event(['visitor_hash' => hash('sha256', 'a'), 'event_type' => 'add_to_cart', 'post_id' => $espresso->id]);
        $this->event(['visitor_hash' => hash('sha256', 'a'), 'event_type' => 'checkout_start']);

        $paid = $this->order('WD-1', 200000, null, 'paid', 'instagram');
        $paid->items()->create([
            'product_id' => $espresso->id, 'product_name' => 'Espresso', 'quantity' => 2, 'unit_price_minor' => 100000,
        ]);
        $this->order('WD-2', 500000, null, 'cancelled');

        $data = $this->getJson('/api/v1/analytics/commerce?'.$this->range())->assertOk()->json('data');

        $this->assertSame('native', $data['source']);
        $this->assertSame(1, $data['order_count']);
        $this->assertSame(200000, $data['revenue_minor']);
        $this->assertSame(200000, $data['aov_minor']);
        $this->assertSame('IRR', $data['currency']);
        $this->assertSame(200000, $data['channels']['instagram']);
        $this->assertSame(0, $data['channels']['site']);
        $this->assertSame(1, $data['new_customers']);
        $this->assertSame(0, $data['returning_customers']);
        $this->assertSame(100.0, (float) $data['change']['revenue_pct']);
        $this->assertEqualsWithDelta(33.33, (float) $data['conversion_pct'], 0.01);

        $funnel = array_column($data['funnel'], 'count', 'step');
        $this->assertSame(['visitors', 'product_views', 'add_to_cart', 'checkout', 'orders'], array_column($data['funnel'], 'step'));
        $this->assertSame(3, $funnel['visitors']);
        $this->assertSame(2, $funnel['product_views']);
        $this->assertSame(1, $funnel['add_to_cart']);
        $this->assertSame(1, $funnel['checkout']);
        $this->assertSame(1, $funnel['orders']);

        $this->assertSame(['product_id' => $espresso->id, 'name' => 'Espresso', 'views' => 2], $data['top_viewed_products'][0]);
        $this->assertSame(['product_id' => $espresso->id, 'name' => 'Espresso', 'adds' => 1], $data['top_cart_products'][0]);
        $this->assertSame(
            ['product_id' => $espresso->id, 'name' => 'Espresso', 'quantity' => 2, 'revenue_minor' => 200000],
            $data['top_purchased_products'][0]
        );
        $this->assertSame([['source' => 'instagram', 'orders' => 1, 'revenue_minor' => 200000]], $data['by_utm_source']);

        $overview = $this->getJson('/api/v1/analytics/overview?'.$this->range())->assertOk()->json('data');
        $this->assertSame(3, $overview['views']);
        $this->assertSame(['order_count' => 1, 'revenue_minor' => 200000, 'currency' => 'IRR'], $overview['shop']);
    }

    public function test_compare_rows_shape(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $this->event(['uri' => '/menu', 'title' => 'Menu']);

        $data = $this->getJson('/api/v1/analytics/compare?'.$this->range())->assertOk()->json('data');

        $this->assertSame('native', $data['source']);
        $this->assertArrayHasKey('from_day', $data['current']);
        $this->assertArrayHasKey('to_day', $data['previous']);
        $this->assertFalse($data['sessions_available']);
        $this->assertSame(
            ['visitors', 'views', 'avg_duration_ms', 'bounce_rate_pct', 'top_sources', 'top_pages', 'site_conversion_pct'],
            array_column($data['rows'], 'key')
        );
        $rows = collect($data['rows'])->keyBy('key');
        $this->assertSame(1, $rows['visitors']['current']);
        $this->assertSame(0, $rows['visitors']['previous']);
        $this->assertSame(100.0, (float) $rows['visitors']['change_pct']);
        $this->assertNull($rows['avg_duration_ms']['current']);
        $this->assertNull($rows['top_pages']['previous']);
    }

    public function test_month_summary_scoring(): void
    {
        $scored = AnalyticsQuery::scoreSignals(['revenue' => 20.0, 'order_count' => 10.0, 'visitors' => null, 'conversion' => -10.0]);
        $this->assertSame('growth', $scored['status']);
        $this->assertSame(9.38, $scored['composite']);
        $this->assertSame(5.9, $scored['score']);
        $this->assertSame(['key' => 'revenue', 'change_pct' => 20.0], $scored['top_achievement']);
        $this->assertSame(['key' => 'conversion', 'change_pct' => -10.0], $scored['top_challenge']);

        $decline = AnalyticsQuery::scoreSignals(['revenue' => -80.0, 'order_count' => -60.0, 'visitors' => -40.0, 'conversion' => -20.0]);
        $this->assertSame('decline', $decline['status']);
        $this->assertSame(0.0, $decline['score']);

        $this->assertSame('stable', AnalyticsQuery::scoreSignals(['revenue' => 2.0, 'order_count' => 0.0])['status']);
        $this->assertNull(AnalyticsQuery::changePct(0, 0));
        $this->assertSame(100.0, AnalyticsQuery::changePct(5, 0));
        $this->assertSame(-33.3, AnalyticsQuery::changePct(2, 3));

        $this->actingAs($this->admin, 'sanctum');
        $this->order('WD-1', 100000);
        $this->order('WD-2', 100000);
        $this->order('WD-0', 100000, Carbon::now('UTC')->subDays(10));

        $from = time() - 6 * 86400;
        $to = time();
        $data = $this->getJson("/api/v1/analytics/month-summary?from={$from}&to={$to}")->assertOk()->json('data');

        $this->assertSame('native', $data['source']);
        $this->assertSame('growth', $data['status']);
        $this->assertSame(10.0, (float) $data['score']);
        $this->assertSame('revenue', $data['top_achievement']['key']);
        $this->assertSame(100.0, (float) $data['top_achievement']['change_pct']);
        $this->assertNull($data['top_challenge']);
        $this->assertSame(['revenue', 'order_count', 'visitors', 'conversion'], array_column($data['deltas'], 'key'));
        $this->assertSame(0.35, (float) $data['deltas'][0]['weight']);
        $this->assertSame(['order_count' => 2, 'revenue_minor' => 200000, 'currency' => 'IRR'], $data['commerce']);
        $this->assertSame(['visitors', 'views', 'sessions'], array_keys($data['traffic']));
    }

    public function test_settings_editable_roles_follow_config(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $roles = config('capabilities.roles');

        $get = $this->getJson('/api/v1/analytics/settings')->assertOk()->json('data');
        $this->assertSame($roles, $get['editable_roles']);
        $this->assertSame(['admin'], $get['settings']['exclude_roles']);

        $post = $this->postJson('/api/v1/analytics/settings', [
            'settings' => ['exclude_roles' => ['staff', 'hacker', 'SHOP_MANAGER']],
        ])->assertOk()->json('data');
        $this->assertSame($roles, $post['editable_roles']);
        $this->assertSame(['staff', 'shop_manager'], $post['settings']['exclude_roles']);
        $this->assertSame('native', $post['source']);
    }

    public function test_purge_cache_returns_ok(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $this->event();
        $before = AnalyticsQuery::cacheVersion($this->tenant->id);

        $data = $this->postJson('/api/v1/analytics/purge-cache')->assertOk()->json('data');

        $this->assertTrue($data['ok']);
        $this->assertIsInt($data['days_rebuilt']);
        $this->assertGreaterThanOrEqual(1, $data['days_rebuilt']);
        $this->assertGreaterThan($before, AnalyticsQuery::cacheVersion($this->tenant->id));
        $this->assertSame(1, (int) DB::table('analytics_daily_totals')->where('tenant_id', $this->tenant->id)->sum('views'));
    }

    public function test_capabilities_gate_sections(): void
    {
        $customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $this->actingAs($customer, 'sanctum');
        $this->getJson('/api/v1/analytics/overview')->assertForbidden();

        $manager = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'shop_manager']);
        $this->actingAs($manager, 'sanctum');
        $this->getJson('/api/v1/analytics/overview')->assertOk()->assertJsonPath('data.source', 'native');
        $this->getJson('/api/v1/analytics/settings')->assertForbidden();

        $staff = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'staff']);
        $this->actingAs($staff, 'sanctum');
        $this->getJson('/api/v1/analytics/settings')->assertOk();
    }

    public function test_bootstrap_skips_excluded_role_and_logged_in(): void
    {
        $headers = ['X-Tenant-Domain' => 'shop.test'];

        $this->getJson('/api/v1/public/analytics/bootstrap', $headers)
            ->assertOk()->assertJsonPath('data.skip', false);

        $staff = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'staff']);
        $this->actingAs($staff, 'sanctum');
        // record_logged_in defaults to false → any logged-in user is skipped.
        $this->getJson('/api/v1/public/analytics/bootstrap', $headers)
            ->assertOk()->assertJsonPath('data.skip', true);

        AnalyticsSettings::save($this->tenant->id, ['record_logged_in' => true, 'exclude_roles' => ['staff']]);
        $this->getJson('/api/v1/public/analytics/bootstrap', $headers)
            ->assertOk()->assertJsonPath('data.skip', true);

        $token = (string) AnalyticsSettings::get($this->tenant->id)['hit_token'];
        $this->postJson('/api/v1/public/analytics/hit', ['type' => 'pageview', 'uri' => '/menu'], $headers + [
            'X-Analytics-Token' => $token, 'User-Agent' => self::UA,
        ])->assertOk()->assertJsonPath('data.skipped', 'role');
        $this->assertSame(0, DB::table('analytics_events')->count());

        $customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $this->actingAs($customer, 'sanctum');
        $this->getJson('/api/v1/public/analytics/bootstrap', $headers)
            ->assertOk()->assertJsonPath('data.skip', false);
    }

    public function test_product_view_hit_is_stored_but_not_counted_as_pageview(): void
    {
        $product = $this->product('Mocha');
        $token = (string) AnalyticsSettings::get($this->tenant->id)['hit_token'];
        $headers = ['X-Tenant-Domain' => 'shop.test', 'X-Analytics-Token' => $token, 'User-Agent' => self::UA];

        $this->postJson('/api/v1/public/analytics/hit', [
            'type' => 'pageview', 'uri' => '/menu/mocha', 'title' => 'Mocha | Shop', 'session_id' => 's1',
        ], $headers)->assertOk()->assertJsonPath('data.skipped', null);
        $this->postJson('/api/v1/public/analytics/hit', [
            'type' => 'product_view', 'uri' => '/menu/mocha', 'post_id' => $product->id, 'session_id' => 's1',
        ], $headers)->assertOk()->assertJsonPath('data.skipped', null);
        $this->postJson('/api/v1/public/analytics/hit', ['type' => 'bogus'], $headers)->assertStatus(422);

        $row = DB::table('analytics_events')->where('event_type', 'product_view')->first();
        $this->assertNotNull($row);
        $this->assertSame($product->id, (int) $row->post_id);
        $this->assertSame(1, (int) DB::table('analytics_visitors')->where('tenant_id', $this->tenant->id)->value('hits'));

        $rollup = app(AnalyticsRollup::class);
        $day = Carbon::now($rollup->timezone())->format('Y-m-d');
        $rollup->rollupDay($this->tenant->id, $day);

        $totals = DB::table('analytics_daily_totals')->where('tenant_id', $this->tenant->id)->where('day', $day)->first();
        $this->assertSame(1, (int) $totals->views);
        $this->assertSame(1, (int) DB::table('analytics_page_daily')->where('tenant_id', $this->tenant->id)->sum('views'));
        $this->assertSame(1, (int) DB::table('analytics_device_daily')->where('dim_type', 'browser')->sum('views'));

        $this->actingAs($this->admin, 'sanctum');
        $pages = $this->getJson('/api/v1/analytics/pages?'.$this->range())->assertOk()->json('data');
        $this->assertSame([['uri' => '/menu/mocha', 'title' => 'Mocha | Shop', 'post_id' => 0, 'views' => 1]], $pages['items']);
    }
}
