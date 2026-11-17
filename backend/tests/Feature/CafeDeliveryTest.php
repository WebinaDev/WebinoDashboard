<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\RoleCapability;
use App\Models\User;
use App\Services\Cafe\CafeDeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Courier run sheet.
 *
 * The risky parts are the ones two people can hit at once (claiming) and the ones a driver
 * could get wrong at the door (who may finish a run, and what happens to the money).
 */
class CafeDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'delivery.test', 'slug' => 'delivery']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];

        // Role capabilities are not seeded in tests; grant exactly what each role needs.
        // admin bypasses the gate entirely (CapabilityChecker returns ['*']), but 'staff'
        // must be given orders.own explicitly or every request would 403.
        RoleCapability::query()->firstOrCreate(['role' => 'staff', 'capability' => 'orders.own']);
    }

    private function user(string $role = 'admin'): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => $role]);
    }

    private function delivery(string $tender = 'online', array $overrides = []): Order
    {
        return Order::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'number' => 'D-'.uniqid(),
            'status' => 'processing',
            'total_minor' => 250_000,
            'subtotal_minor' => 250_000,
            'shipping_minor' => 20_000,
            'discount_minor' => 0,
            'tax_minor' => 0,
            'currency' => 'IRT',
            'payment_tender' => $tender,
            'customer_name' => 'Reza',
            'customer_phone' => '09120000000',
            'shipping_address' => [
                'address_line' => 'Valiasr 120',
                'city' => 'Tehran',
            ],
        ], $overrides));
    }

    public function test_board_lists_deliverable_orders_only(): void
    {
        $admin = $this->user();
        $this->delivery();
        $this->delivery('cash');
        // No address => not a delivery.
        Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'D-pickup',
            'status' => 'processing',
            'total_minor' => 100_000,
            'subtotal_minor' => 100_000,
            'shipping_minor' => 0,
            'discount_minor' => 0,
            'tax_minor' => 0,
            'currency' => 'IRT',
        ]);
        // Cancelled => hidden.
        $this->delivery('online', ['status' => 'cancelled']);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/cafe/deliveries', $this->h)
            ->assertOk();

        $this->assertCount(2, $res->json('data'));
        $this->assertSame('queued', $res->json('data.0.delivery_status'));
    }

    public function test_a_driver_claims_and_runs_a_delivery_to_the_door(): void
    {
        $admin = $this->user();
        $driver = $this->user();
        $order = $this->delivery();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/claim", [], $this->h)
            ->assertOk()
            ->assertJsonPath('data.delivery_status', 'claimed')
            ->assertJsonPath('data.delivery_driver_id', $driver->id);

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/pick-up", [], $this->h)
            ->assertOk()
            ->assertJsonPath('data.delivery_status', 'picked_up');

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/deliver", [], $this->h)
            ->assertOk()
            ->assertJsonPath('data.delivery_status', 'delivered');

        $fresh = $order->fresh();
        $this->assertNotNull($fresh->delivery_completed_at);
        // The kitchen board is kept in step.
        $this->assertSame('done', $fresh->meta['kitchen_status'] ?? null);
    }

    public function test_two_drivers_cannot_claim_the_same_run(): void
    {
        $first = $this->user();
        $second = $this->user();
        $order = $this->delivery();

        $this->actingAs($first, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/claim", [], $this->h)
            ->assertOk();

        $this->actingAs($second, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/claim", [], $this->h)
            ->assertStatus(422)
            ->assertJsonValidationErrors('delivery');

        $this->assertSame($first->id, $order->fresh()->delivery_driver_id);
    }

    public function test_a_driver_cannot_finish_someone_elses_run(): void
    {
        $owner = $this->user();
        $other = $this->user();
        $order = $this->delivery();

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/claim", [], $this->h)
            ->assertOk();

        $this->actingAs($other, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/pick-up", [], $this->h)
            ->assertStatus(422)
            ->assertJsonValidationErrors('delivery');
    }

    public function test_delivering_before_pickup_is_rejected(): void
    {
        $driver = $this->user();
        $order = $this->delivery();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/claim", [], $this->h)
            ->assertOk();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/deliver", [], $this->h)
            ->assertStatus(422)
            ->assertJsonValidationErrors('delivery');
    }

    public function test_a_failed_run_records_a_reason_and_frees_the_driver(): void
    {
        $driver = $this->user();
        $order = $this->delivery();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/claim", [], $this->h)
            ->assertOk();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/fail", ['reason' => 'no answer'], $this->h)
            ->assertOk()
            ->assertJsonPath('data.delivery_status', 'failed')
            ->assertJsonPath('data.failure_reason', 'no answer');

        $this->assertNull($order->fresh()->delivery_driver_id);
    }

    public function test_cash_on_delivery_reports_the_amount_to_collect(): void
    {
        $admin = $this->user();
        $cod = $this->delivery('cod');

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/cafe/deliveries', $this->h)
            ->assertOk();

        $row = collect($res->json('data'))->firstWhere('id', $cod->id);
        $this->assertTrue($row['collect_cash']);
        $this->assertSame(250_000, $row['collect_minor']);
    }

    public function test_an_already_paid_order_collects_nothing(): void
    {
        $admin = $this->user();
        $paid = $this->delivery('cod', ['status' => 'paid']);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/cafe/deliveries', $this->h)->assertOk();
        $row = collect($res->json('data'))->firstWhere('id', $paid->id);

        $this->assertFalse($row['collect_cash']);
        $this->assertSame(0, $row['collect_minor']);
    }

    public function test_a_manager_can_release_a_stuck_run(): void
    {
        $driver = $this->user();
        $admin = $this->user();
        $order = $this->delivery();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/claim", [], $this->h)
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/release", [], $this->h)
            ->assertOk()
            ->assertJsonPath('data.delivery_status', 'queued')
            ->assertJsonPath('data.delivery_driver_id', null);

        // Back in the pool for anyone to take.
        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/claim", [], $this->h)
            ->assertOk();
    }

    public function test_a_plain_driver_cannot_release_a_run(): void
    {
        $driver = $this->user();
        $order = $this->delivery();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/claim", [], $this->h)
            ->assertOk();

        // 'staff' has orders.own, not orders.*, so dispatch actions are closed to them.
        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$order->id}/release", [], $this->h)
            ->assertForbidden();
    }

    public function test_another_tenants_order_is_invisible(): void
    {
        $other = $this->createTenant(['domain' => 'other-delivery.test', 'slug' => 'other-delivery']);
        $foreign = Order::query()->create([
            'tenant_id' => $other->id,
            'number' => 'X-1',
            'status' => 'processing',
            'total_minor' => 100_000,
            'subtotal_minor' => 100_000,
            'shipping_minor' => 0,
            'discount_minor' => 0,
            'tax_minor' => 0,
            'currency' => 'IRT',
            'shipping_address' => ['address_line' => 'Elsewhere'],
        ]);

        $this->actingAs($this->user(), 'sanctum')
            ->postJson("/api/v1/cafe/deliveries/{$foreign->id}/claim", [], $this->h)
            ->assertForbidden();
    }

    public function test_the_service_exposes_only_active_runs_per_driver(): void
    {
        $driver = $this->user();
        $active = $this->delivery();
        $done = $this->delivery();

        app(CafeDeliveryService::class)->claim($driver, $active);
        $finishedOrder = app(CafeDeliveryService::class)->claim($driver, $done);
        app(CafeDeliveryService::class)->pickUp($driver, $finishedOrder);
        app(CafeDeliveryService::class)->deliver($driver, $finishedOrder);

        $runs = app(CafeDeliveryService::class)->byDriver($this->tenant->id, $driver->id);

        $this->assertCount(1, $runs);
        $this->assertSame($active->id, $runs->first()->id);
    }
}
