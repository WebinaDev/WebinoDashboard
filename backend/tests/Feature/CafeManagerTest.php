<?php

namespace Tests\Feature;

use App\Models\CafeShift;
use App\Models\CafeTable;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\RoleCapability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Manager KPI board.
 *
 * The KPI screen is where a manager decides staffing and pricing, so the numbers must agree
 * with the order reports and must exclude exactly what those reports exclude.
 */
class CafeManagerTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'manager.test', 'slug' => 'manager']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];

        RoleCapability::query()->firstOrCreate(['role' => 'staff', 'capability' => 'orders.own']);
    }

    private function user(string $role = 'admin'): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => $role]);
    }

    private function order(int $totalMinor, string $status = 'completed', array $overrides = []): Order
    {
        return Order::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'number' => 'M-'.uniqid(),
            'status' => $status,
            'total_minor' => $totalMinor,
            'subtotal_minor' => $totalMinor,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'tax_minor' => 0,
            'payment_tender' => 'cash',
            'currency' => 'IRT',
            'created_at' => now(),
        ], $overrides));
    }

    public function test_overview_reports_sales_and_aov(): void
    {
        $this->order(100_000);
        $this->order(300_000);

        $res = $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview', $this->h)
            ->assertOk()
            ->assertJsonPath('data.sales.orders', 2)
            ->assertJsonPath('data.sales.revenue_minor', 400_000)
            ->assertJsonPath('data.sales.aov_minor', 200_000);

        $this->assertSame('today', $res->json('data.range'));
    }

    public function test_excluded_statuses_never_reach_the_kpis(): void
    {
        $this->order(100_000);
        $this->order(999_000, 'cancelled');
        $this->order(888_000, 'pending_payment');
        $this->order(777_000, 'refunded');
        $this->order(666_000, 'failed');

        $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview', $this->h)
            ->assertOk()
            ->assertJsonPath('data.sales.orders', 1)
            ->assertJsonPath('data.sales.revenue_minor', 100_000);
    }

    public function test_aov_is_zero_when_nothing_sold(): void
    {
        $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview', $this->h)
            ->assertOk()
            ->assertJsonPath('data.sales.orders', 0)
            ->assertJsonPath('data.sales.aov_minor', 0);
    }

    public function test_orders_outside_the_window_are_ignored(): void
    {
        $this->order(100_000);
        // Yesterday must not land in "today".
        $this->order(500_000, 'completed', ['created_at' => now()->subDay()]);

        $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview?range=today', $this->h)
            ->assertOk()
            ->assertJsonPath('data.sales.revenue_minor', 100_000);

        $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview?range=last7', $this->h)
            ->assertOk()
            ->assertJsonPath('data.sales.revenue_minor', 600_000);
    }

    public function test_channel_breakdown_splits_by_tender(): void
    {
        $this->order(100_000, 'completed', ['payment_tender' => 'cash']);
        $this->order(50_000, 'completed', ['payment_tender' => 'cash']);
        $this->order(400_000, 'completed', ['payment_tender' => 'pos_terminal']);

        $res = $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview', $this->h)
            ->assertOk();

        $channels = collect($res->json('data.channels'))->keyBy('tender');

        $this->assertSame(150_000, $channels['cash']['amount_minor']);
        $this->assertSame(2, $channels['cash']['orders']);
        $this->assertSame(400_000, $channels['pos_terminal']['amount_minor']);
    }

    public function test_table_occupancy_uses_the_stored_status(): void
    {
        CafeTable::query()->create([
            'tenant_id' => $this->tenant->id, 'code' => 'A1', 'seats' => 4,
            'is_active' => true, 'status' => CafeTable::STATUS_SEATED,
        ]);
        CafeTable::query()->create([
            'tenant_id' => $this->tenant->id, 'code' => 'A2', 'seats' => 6,
            'is_active' => true, 'status' => CafeTable::STATUS_FREE,
        ]);

        $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview', $this->h)
            ->assertOk()
            ->assertJsonPath('data.tables.total', 2)
            ->assertJsonPath('data.tables.occupied', 1)
            ->assertJsonPath('data.tables.occupancy_percent', 50)
            ->assertJsonPath('data.tables.seated_seats', 4);
    }

    public function test_till_snapshot_reports_todays_variance(): void
    {
        $cashier = $this->user();

        // One balanced shift and one drawer that came up short.
        CafeShift::query()->create([
            'tenant_id' => $this->tenant->id, 'user_id' => $cashier->id,
            'status' => CafeShift::STATUS_CLOSED, 'opening_float_minor' => 0,
            'expected_cash_minor' => 100_000, 'counted_cash_minor' => 100_000,
            'variance_minor' => 0, 'closed_at' => now(),
        ]);
        CafeShift::query()->create([
            'tenant_id' => $this->tenant->id, 'user_id' => $cashier->id,
            'status' => CafeShift::STATUS_CLOSED, 'opening_float_minor' => 0,
            'expected_cash_minor' => 200_000, 'counted_cash_minor' => 180_000,
            'variance_minor' => -20_000, 'closed_at' => now(),
        ]);
        CafeShift::query()->create([
            'tenant_id' => $this->tenant->id, 'user_id' => $cashier->id,
            'status' => CafeShift::STATUS_OPEN, 'opening_float_minor' => 50_000,
            'variance_minor' => 0, 'opened_at' => now(),
        ]);

        $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview', $this->h)
            ->assertOk()
            ->assertJsonPath('data.tills.open_shifts', 1)
            ->assertJsonPath('data.tills.closed_today', 2)
            ->assertJsonPath('data.tills.variance_minor', -20_000)
            ->assertJsonPath('data.tills.shifts_with_variance', 1);
    }

    public function test_top_items_rank_by_quantity(): void
    {
        $burger = $this->order(150_000);
        $tea = $this->order(60_000);

        OrderItem::query()->create([
            'order_id' => $burger->id, 'product_name' => 'Burger',
            'quantity' => 1, 'unit_price_minor' => 150_000,
        ]);
        OrderItem::query()->create([
            'order_id' => $tea->id, 'product_name' => 'Tea',
            'quantity' => 3, 'unit_price_minor' => 20_000,
        ]);

        $res = $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview', $this->h)
            ->assertOk();

        $top = $res->json('data.top_items');
        $this->assertSame('Tea', $top[0]['name']);
        $this->assertSame(3, $top[0]['quantity']);
        $this->assertSame('Burger', $top[1]['name']);
    }

    public function test_a_cashier_without_reporting_capability_is_refused(): void
    {
        // 'staff' holds orders.own only; the KPI board requires reports.shop or orders.*.
        $this->actingAs($this->user('staff'), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview', $this->h)
            ->assertForbidden();
    }

    public function test_another_tenants_sales_are_not_counted(): void
    {
        $other = $this->createTenant(['domain' => 'other-manager.test', 'slug' => 'other-manager']);
        Order::query()->create([
            'tenant_id' => $other->id, 'number' => 'X-1', 'status' => 'completed',
            'total_minor' => 9_999_000, 'subtotal_minor' => 9_999_000,
            'discount_minor' => 0, 'shipping_minor' => 0, 'tax_minor' => 0,
            'currency' => 'IRT', 'created_at' => now(),
        ]);

        $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview', $this->h)
            ->assertOk()
            ->assertJsonPath('data.sales.revenue_minor', 0);
    }

    public function test_an_invalid_range_is_rejected(): void
    {
        $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/manager/overview?range=forever', $this->h)
            ->assertStatus(422);
    }
}
