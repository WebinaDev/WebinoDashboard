<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Orders\OrderStatusService;
use App\Services\Orders\OrderStock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockReservationTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'hold.test', 'slug' => 'hold']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true, 'commerce.cart' => true, 'commerce.checkout' => true,
            'commerce.orders' => true, 'cafe.menu' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'menu', array_merge(
            ModuleSettingsService::cafeMenuDefaults(),
            ['block_orders_when_closed' => false],
        ));
    }

    private function product(int $stock): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Cake', 'slug' => 'cake-'.uniqid(), 'status' => 'publish',
            'price_minor' => 50000, 'currency' => 'IRR', 'is_available' => true, 'is_hidden' => false,
            'is_sold_out' => false, 'stock_status' => 'instock', 'manage_stock' => true, 'stock' => $stock,
        ]);
    }

    private function pendingOrder(Product $p, int $qty): Order
    {
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id, 'status' => 'pending_payment',
            'subtotal_minor' => 50000 * $qty, 'total_minor' => 50000 * $qty, 'currency' => 'IRR', 'meta' => [],
        ]);
        OrderItem::query()->create(['order_id' => $order->id, 'product_id' => $p->id, 'quantity' => $qty, 'unit_price_minor' => 50000]);
        app(OrderStock::class)->sync($order, null, 'pending_payment');

        return $order->fresh();
    }

    public function test_hold_then_paid_deducts_once(): void
    {
        $p = $this->product(5);
        $order = $this->pendingOrder($p, 2);
        $this->assertSame(3, (int) $p->fresh()->stock);
        $this->assertTrue($order->meta['stock_reserved']);

        $this->assertTrue(app(OrderStatusService::class)->apply($order, 'awaiting_gateway'));
        $this->assertTrue(app(OrderStatusService::class)->apply($order, 'paid'));
        $this->assertSame(3, (int) $p->fresh()->stock);
        $this->assertFalse((bool) $order->fresh()->meta['stock_reserved']);

        // Cancelling the sale still gives the stock back exactly once.
        app(OrderStatusService::class)->apply($order->fresh(), 'cancelled');
        $this->assertSame(5, (int) $p->fresh()->stock);
    }

    public function test_second_buyer_cannot_take_held_stock(): void
    {
        $p = $this->product(2);
        $this->pendingOrder($p, 2);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->pendingOrder($p, 1);
    }

    public function test_failure_and_cancel_release_hold(): void
    {
        $p = $this->product(5);
        $a = $this->pendingOrder($p, 2);
        app(OrderStatusService::class)->apply($a, 'payment_failed');
        $this->assertSame(5, (int) $p->fresh()->stock);

        // Retrying the payment holds again.
        app(OrderStatusService::class)->apply($a->fresh(), 'pending_payment');
        $this->assertSame(3, (int) $p->fresh()->stock);

        $b = $this->pendingOrder($p, 1);
        app(OrderStatusService::class)->apply($b, 'cancelled');
        $this->assertSame(3, (int) $p->fresh()->stock);
    }

    public function test_expired_hold_is_released_by_scheduled_command_and_late_payment_still_succeeds(): void
    {
        config(['shop.stock_reservation_minutes' => 15]);
        $p = $this->product(2);
        $order = $this->pendingOrder($p, 2);
        $this->assertSame(0, (int) $p->fresh()->stock);

        $this->travel(10)->minutes();
        $this->artisan('stock:release-reservations')->assertSuccessful();
        $this->assertSame(0, (int) $p->fresh()->stock);

        $this->travel(6)->minutes();
        $this->artisan('stock:release-reservations')->assertSuccessful();
        $this->assertSame(2, (int) $p->fresh()->stock);
        $this->assertSame('pending_payment', $order->fresh()->status);

        // Someone else buys one in the meantime, then the late gateway confirmation arrives.
        $this->pendingOrder($p, 1);
        $this->assertTrue(app(OrderStatusService::class)->apply($order->fresh(), 'paid'));
        $this->assertSame(0, (int) $p->fresh()->stock);
        $this->assertTrue((bool) $order->fresh()->meta['stock_shortfall']);
    }

    public function test_cafe_online_checkout_holds_stock_and_failed_callback_releases_it(): void
    {
        $p = $this->product(3);
        $this->postJson('/api/v1/public/cafe/cart/items', ['product_id' => $p->id, 'quantity' => 2, 'guest_token' => 'tok-hold'], $this->h)->assertOk();
        $res = $this->postJson('/api/v1/public/cafe/checkout', [
            'guest_token' => 'tok-hold', 'fulfillment' => 'dine_in', 'table_number' => '1',
            'payment_method' => 'cash', 'idempotency_key' => 'hold-key-1',
        ], $this->h)->assertCreated();
        // Cash orders are confirmed immediately: a plain sale, no hold.
        $this->assertSame(1, (int) $p->fresh()->stock);
        $order = Order::query()->findOrFail($res->json('data.id'));
        $this->assertEmpty($order->meta['stock_reserved'] ?? false);

        $online = $this->pendingOrder($p, 1);
        $this->assertSame(0, (int) $p->fresh()->stock);
        app(OrderStatusService::class)->apply($online, 'awaiting_gateway');
        app(OrderStatusService::class)->apply($online->fresh(), 'payment_failed');
        $this->assertSame(1, (int) $p->fresh()->stock);
    }

    public function test_kitchen_moves_paid_online_order_to_completed(): void
    {
        $p = $this->product(5);
        $order = $this->pendingOrder($p, 1);
        app(OrderStatusService::class)->apply($order, 'paid');
        $order->meta = array_merge($order->fresh()->meta, ['source' => 'guest_table', 'kitchen_status' => 'new']);
        $order->saveQuietly();

        $admin = \App\Models\User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $this->patchJson('/api/v1/cafe/kitchen-orders/'.$order->id, ['kitchen_status' => 'preparing'])->assertOk();
        $this->assertSame('processing', $order->fresh()->status);
        $this->patchJson('/api/v1/cafe/kitchen-orders/'.$order->id, ['kitchen_status' => 'done'])->assertOk();
        $this->assertSame('completed', $order->fresh()->status);
        $this->assertSame(4, (int) $p->fresh()->stock);
        $history = collect($order->fresh()->meta['status_history'] ?? [])->pluck('to')->all();
        $this->assertSame(['paid', 'processing', 'completed'], $history);

        $unpaid = $this->pendingOrder($p, 1);
        $this->patchJson('/api/v1/cafe/kitchen-orders/'.$unpaid->id, ['kitchen_status' => 'done'])->assertStatus(422);
    }
}
