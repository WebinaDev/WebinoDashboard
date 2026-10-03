<?php

namespace Tests\Feature;

use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardLogicAuditTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $admin;

    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'logic-audit.test', 'slug' => 'logic-audit']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
            'commerce.orders' => true,
            'commerce.wallet' => true,
            'cafe.menu' => true,
            'coffee-profile.profile' => true,
            'marketing.coupons' => true,
        ]);
        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
        $this->customer = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'customer',
            'wallet_balance_minor' => 0,
        ]);
    }

    public function test_public_catalog_and_cart_only_accept_published_products(): void
    {
        $live = $this->product('Live', 'publish');
        $this->product('Draft', 'draft');
        $this->product('Private', 'private');
        $this->product('Trashed', 'trash');

        $names = collect($this->getJson('/api/v1/public/catalog', [
            'X-Tenant-Domain' => $this->tenant->domain,
        ])->assertOk()->json('data.items'))->pluck('name')->all();

        $this->assertSame(['Live'], $names);

        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', [
            'product_id' => $this->product('Hidden draft', 'draft')->id,
            'quantity' => 1,
        ])->assertStatus(422);

        $this->postJson('/api/v1/cart/items', [
            'product_id' => $live->id,
            'quantity' => 1,
        ])->assertOk();
    }

    public function test_stock_drops_on_paid_and_cafe_orders_and_returns_on_cancel(): void
    {
        $paidProduct = $this->product('Paid item', 'publish', ['manage_stock' => true, 'stock' => 5]);
        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $paidProduct->id, 'quantity' => 1])->assertOk();
        $order = $this->postJson('/api/v1/checkout')->assertCreated()->json('data');
        $this->assertSame(5, (int) $paidProduct->fresh()->stock);

        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$order['id'], ['status' => 'paid'])->assertOk();
        $this->assertSame(4, (int) $paidProduct->fresh()->stock);

        $this->patchJson('/api/v1/orders/'.$order['id'], ['status' => 'cancelled'])->assertOk();
        $this->assertSame(5, (int) $paidProduct->fresh()->stock);

        $cafe = $this->product('Cafe item', 'publish', ['manage_stock' => true, 'stock' => 8]);
        $token = 'table-guest-1';
        $this->postJson('/api/v1/public/cafe/cart/items', [
            'product_id' => $cafe->id,
            'quantity' => 2,
            'guest_token' => $token,
        ], ['X-Tenant-Domain' => $this->tenant->domain])->assertOk();
        $cafeOrder = $this->postJson('/api/v1/public/cafe/checkout', [
            'guest_token' => $token,
            'table_number' => '4',
        ], ['X-Tenant-Domain' => $this->tenant->domain])->assertCreated()->json('data');
        $this->assertSame('processing', $cafeOrder['status']);
        $this->assertSame(6, (int) $cafe->fresh()->stock);

        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$cafeOrder['id'], ['status' => 'cancelled'])->assertOk();
        $this->assertSame(8, (int) $cafe->fresh()->stock);
    }

    public function test_coupon_is_held_until_payment_and_usage_limit_blocks_a_second_hold(): void
    {
        $product = $this->product('Coupon item', 'publish');
        $coupon = Coupon::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => 'ONCE',
            'type' => 'percent',
            'amount' => 10,
            'status' => 'publish',
            'usage_limit' => 1,
            'usage_count' => 0,
        ]);

        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $order = $this->postJson('/api/v1/checkout', ['coupon_code' => 'ONCE'])->assertCreated()->json('data');
        $this->assertSame(0, (int) $coupon->fresh()->usage_count);
        $this->assertSame(1, CouponRedemption::query()->where('order_id', $order['id'])->count());

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $this->postJson('/api/v1/checkout', ['coupon_code' => 'ONCE'])->assertStatus(422);
        $this->assertSame(0, (int) $coupon->fresh()->usage_count);

        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$order['id'], ['status' => 'cancelled'])->assertOk();
        $this->assertSame(0, CouponRedemption::query()->where('coupon_id', $coupon->id)->count());

        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $paid = $this->postJson('/api/v1/checkout', ['coupon_code' => 'ONCE'])->assertCreated()->json('data');
        $this->assertSame(0, (int) $coupon->fresh()->usage_count);

        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$paid['id'], ['status' => 'paid'])->assertOk();
        $this->assertSame(1, (int) $coupon->fresh()->usage_count);
    }

    public function test_coupon_password_and_schedule_are_enforced(): void
    {
        $product = $this->product('Secret item', 'publish');
        Coupon::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => 'LOCK',
            'type' => 'fixed_cart',
            'amount' => 100,
            'status' => 'publish',
            'visibility' => 'password',
            'password' => 'open-sesame',
        ]);
        Coupon::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => 'LATER',
            'type' => 'fixed_cart',
            'amount' => 100,
            'status' => 'publish',
            'scheduled_at' => now()->addDay(),
        ]);

        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $this->postJson('/api/v1/checkout', ['coupon_code' => 'LOCK'])->assertStatus(422);
        $this->postJson('/api/v1/checkout', [
            'coupon_code' => 'LOCK',
            'coupon_password' => 'open-sesame',
        ])->assertCreated();

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $this->postJson('/api/v1/checkout', ['coupon_code' => 'LATER'])->assertStatus(422);
    }

    public function test_wallet_topup_requires_payment_checkout_debits_and_refund_credits_once(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $this->postJson('/api/v1/wallet/topup', [
            'user_id' => $this->customer->id,
            'amount_minor' => 20000,
        ])->assertCreated();
        $this->assertSame(20000, (int) $this->customer->fresh()->wallet_balance_minor);

        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/account/wallet/topup', ['amount_minor' => 5000])->assertStatus(422);
        $this->assertSame(20000, (int) $this->customer->fresh()->wallet_balance_minor);

        $product = $this->product('Wallet item', 'publish', ['manage_stock' => true, 'stock' => 3, 'price_minor' => 8000]);
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $order = $this->postJson('/api/v1/checkout', ['payment_method' => 'wallet'])->assertCreated()->json('data');
        $this->assertSame('paid', $order['status']);
        $this->assertSame(12000, (int) $this->customer->fresh()->wallet_balance_minor);
        $this->assertSame(2, (int) $product->fresh()->stock);

        $this->actingAs($this->admin, 'sanctum');
        $returnId = $this->postJson('/api/v1/orders/'.$order['id'].'/returns', [
            'refund_minor' => 8000,
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', ['action' => 'approve'])->assertOk();
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', ['action' => 'receive'])->assertOk();
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', [
            'action' => 'refund',
            'refund_minor' => 8000,
        ])->assertOk();

        $this->assertSame('refunded', \App\Models\Order::query()->find($order['id'])->status);
        $this->assertSame(20000, (int) $this->customer->fresh()->wallet_balance_minor);
        $this->assertSame(3, (int) $product->fresh()->stock);
    }

    public function test_subscriber_portal_author_catalog_and_coffee_site_gate(): void
    {
        $subscriber = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'subscriber',
        ]);
        $this->actingAs($subscriber, 'sanctum');
        $this->getJson('/api/v1/account/overview')->assertOk();

        $author = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'author',
        ]);
        $this->actingAs($author, 'sanctum');
        $this->postJson('/api/v1/products', ['name' => 'Nope', 'price_minor' => 1000])
            ->assertForbidden()
            ->assertJsonPath('errors.code', 'CAPABILITY_DENIED');

        $this->actingAs($this->admin, 'sanctum');
        $this->getJson('/api/v1/coffee/pricing-settings')->assertNotFound();

        $this->tenant->update(['site_type_slug' => 'coffee']);
        $this->getJson('/api/v1/coffee/pricing-settings')->assertOk();
    }

    public function test_bulk_status_cannot_revive_a_cancelled_order(): void
    {
        $order = \App\Models\Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'ORD-CANCELLED',
            'status' => 'cancelled',
            'total_minor' => 1000,
            'currency' => 'IRR',
        ]);

        $this->actingAs($this->admin, 'sanctum');
        $this->postJson('/api/v1/orders/bulk', [
            'action' => 'change_status',
            'status' => 'paid',
            'ids' => [$order->id],
        ])->assertOk();

        $this->assertSame('cancelled', $order->fresh()->status);
    }

    /** @param  array<string, mixed>  $extra */
    private function product(string $name, string $status, array $extra = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'slug' => str($name)->slug().'-'.uniqid(),
            'price_minor' => 10000,
            'currency' => 'IRR',
            'status' => $status,
            'is_available' => true,
            'is_hidden' => false,
            'is_sold_out' => false,
            'stock_status' => 'instock',
            'manage_stock' => false,
            'stock' => 10,
        ], $extra));
    }
}
