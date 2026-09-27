<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShopParityTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop-parity',
            'domain' => 'parity.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'commerce.account' => true,
            'commerce.accounting' => true,
            'core.settings' => true,
        ]);
        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
        $this->customer = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'customer',
        ]);
    }

    public function test_variable_product_create_skips_retail_sync_and_price_stays_zero(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $res = $this->postJson('/api/v1/products', [
            'name' => 'Variable Tee',
            'type' => 'variable',
            'purchase_price_minor' => 50000,
            'status' => 'publish',
        ])->assertCreated()->json('data');

        $this->assertSame('variable', $res['type']);
        $this->assertSame(0, (int) $res['price_minor']);
    }

    public function test_locked_order_patch_address_returns_422(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->customer->id,
            'status' => 'completed',
            'subtotal_minor' => 1000,
            'total_minor' => 1000,
            'currency' => 'IRT',
        ]);

        $this->patchJson("/api/v1/orders/{$order->id}", [
            'shipping_address' => ['address' => 'New street'],
        ])->assertStatus(422)->assertJsonPath('message', 'Order is locked');
    }

    public function test_return_transition_approve_from_requested_and_reject_refund_from_requested_fails(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->customer->id,
            'status' => 'completed',
            'subtotal_minor' => 1000,
            'total_minor' => 1000,
            'currency' => 'IRT',
        ]);
        $ret = OrderReturn::query()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->id,
            'user_id' => $this->customer->id,
            'status' => 'requested',
        ]);

        $this->postJson("/api/v1/order-returns/{$ret->id}/action", ['action' => 'approve'])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $ret2 = OrderReturn::query()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->id,
            'user_id' => $this->customer->id,
            'status' => 'requested',
        ]);

        $this->postJson("/api/v1/order-returns/{$ret2->id}/action", ['action' => 'refund'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Invalid return transition');
    }

    public function test_account_portal_orders_only_own(): void
    {
        $other = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $mine = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->customer->id,
            'status' => 'paid',
            'subtotal_minor' => 2000,
            'total_minor' => 2000,
            'currency' => 'IRT',
        ]);
        $theirs = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $other->id,
            'status' => 'paid',
            'subtotal_minor' => 3000,
            'total_minor' => 3000,
            'currency' => 'IRT',
        ]);

        $this->actingAs($this->customer, 'sanctum');
        $ids = collect($this->getJson('/api/v1/account/orders')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertContains($mine->id, $ids);
        $this->assertNotContains($theirs->id, $ids);

        $this->getJson("/api/v1/account/orders/{$mine->id}")->assertOk();
        $this->getJson("/api/v1/account/orders/{$theirs->id}")->assertNotFound();
    }

    public function test_journal_create(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $this->postJson('/api/v1/accounting/journals', [
            'number' => 'J-001',
            'date' => '2026-09-27',
            'description' => 'Opening',
            'lines' => [
                ['account_code' => '101', 'account_name' => 'Cash', 'debit_minor' => 10000, 'credit_minor' => 0],
                ['account_code' => '201', 'account_name' => 'Equity', 'debit_minor' => 0, 'credit_minor' => 10000],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.number', 'J-001')
            ->assertJsonPath('data.total_debit_minor', 10000);

        $this->assertDatabaseHas('accounting_journals', ['tenant_id' => $this->tenant->id, 'number' => 'J-001']);
    }

    public function test_product_catalog_search_and_import(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Searchable Widget',
            'slug' => 'searchable-widget',
            'sku' => 'SW-1',
            'price_minor' => 1000,
            'currency' => 'IRT',
            'status' => 'publish',
            'type' => 'simple',
            'stock' => 1,
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => false,
        ]);

        $this->getJson('/api/v1/product-catalog/search?q=Widget')
            ->assertOk()
            ->assertJsonPath('data.local.0.name', 'Searchable Widget');

        $this->postJson('/api/v1/product-catalog/import', [
            'name' => 'Imported SKU',
            'sku' => 'IMP-1',
            'price_minor' => 2500,
        ])->assertCreated()
            ->assertJsonPath('data.sku', 'IMP-1');
    }
}
