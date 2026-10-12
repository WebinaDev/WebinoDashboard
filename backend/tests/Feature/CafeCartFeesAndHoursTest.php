<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use App\Services\Cafe\CafeOrdering;
use App\Services\Modules\ModuleSettingsService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CafeCartFeesAndHoursTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'cafe-fees.test', 'slug' => 'cafe-fees']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
    }

    private function menu(array $overrides): void
    {
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'menu', array_merge(
            ModuleSettingsService::cafeMenuDefaults(),
            ['block_orders_when_closed' => false],
            $overrides,
        ));
    }

    private function product(string $name, int $price = 100000): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'slug' => str($name)->slug().'-'.uniqid(),
            'status' => 'publish',
            'price_minor' => $price,
            'currency' => 'IRR',
            'is_available' => true,
            'is_hidden' => false,
            'is_sold_out' => false,
            'stock_status' => 'instock',
            'manage_stock' => false,
            'stock' => 10,
        ]);
    }

    public function test_add_to_cart_works_without_options_and_shows_reason_when_unavailable(): void
    {
        $this->menu([]);
        $p = $this->product('Espresso');

        // Exact payload the cafe ItemSheet sends.
        $this->postJson('/api/v1/public/cafe/cart/items', [
            'product_id' => $p->id,
            'quantity' => 1,
            'guest_token' => 'abc123abc123abc123',
            'table_number' => null,
            'branch_slug' => null,
            'option_ids' => [],
            'variant_id' => null,
        ], $this->h)->assertOk()->assertJsonPath('data.items.0.quantity', 1);

        $p->update(['is_sold_out' => true]);
        $this->postJson('/api/v1/public/cafe/cart/items', [
            'product_id' => $p->id, 'guest_token' => 'abc123abc123abc123', 'option_ids' => [], 'variant_id' => null,
        ], $this->h)->assertStatus(422)->assertJsonPath('message', __('api.cafe_item_unavailable'));
    }

    public function test_persian_digit_hours_are_parsed(): void
    {
        $hours = ['timezone' => 'Asia/Tehran', 'days' => [
            ['day' => 'saturday', 'open' => '۰۸:۰۰', 'close' => '۲۳:۰۰', 'closed' => false],
        ], 'closed_dates' => []];
        // Saturday 2026-10-10 12:00 Tehran.
        $now = Carbon::parse('2026-10-10 12:00', 'Asia/Tehran');
        $this->assertTrue(CafeOrdering::openAt($hours, $now)['is_open']);
    }

    public function test_fees_follow_menu_settings(): void
    {
        $this->menu([
            'packaging_fee_minor' => 5000,
            'packaging_fee_mode' => 'per_item',
            'packaging_dine_in' => false,
            'packaging_pickup' => true,
            'packaging_delivery' => true,
            'delivery_fee_minor' => 20000,
            'free_delivery_threshold_minor' => 0,
            'service_fee_percent' => 10,
            'service_fee_dine_in_only' => true,
            'fulfillment_delivery' => true,
        ]);
        $p = $this->product('Latte', 100000);
        $token = 'fees-token-123456';
        $this->postJson('/api/v1/public/cafe/cart/items', ['product_id' => $p->id, 'quantity' => 2, 'guest_token' => $token], $this->h)->assertOk();

        // Dine-in: no packaging, 10% service.
        $dine = $this->getJson('/api/v1/public/cafe/cart?guest_token='.$token.'&fulfillment=dine_in', $this->h)->assertOk()->json('data.totals');
        $this->assertSame(0, $dine['packaging_minor']);
        $this->assertSame(20000, $dine['service_minor']);

        // Pickup: packaging per item (2 x 5000), no service.
        $pickup = $this->getJson('/api/v1/public/cafe/cart?guest_token='.$token.'&fulfillment=pickup', $this->h)->assertOk()->json('data.totals');
        $this->assertSame(10000, $pickup['packaging_minor']);
        $this->assertSame(0, $pickup['service_minor']);

        $order = $this->postJson('/api/v1/public/cafe/checkout', ['guest_token' => $token, 'fulfillment' => 'delivery'], $this->h)
            ->assertCreated()->json('data');
        $this->assertSame(10000 + 20000, (int) $order['shipping_minor']);
        $this->assertSame(200000 + 30000, (int) $order['total_minor']);
    }

    public function test_dashboard_todos_are_saved_per_user(): void
    {
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $this->putJson('/api/v1/dashboard/todos', ['items' => [['title' => 'سفارش شیر', 'done' => false, 'due_date' => '2026-10-14']]])
            ->assertOk()->assertJsonPath('data.0.title', 'سفارش شیر');
        $this->getJson('/api/v1/dashboard/todos')->assertOk()->assertJsonCount(1, 'data');
    }
}
