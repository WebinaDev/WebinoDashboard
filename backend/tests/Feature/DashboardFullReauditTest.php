<?php

namespace Tests\Feature;

use App\Models\BotSetting;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Product;
use App\Models\User;
use App\Models\WalletLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardFullReauditTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $admin;

    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'reaudit.test', 'slug' => 'reaudit']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
            'commerce.orders' => true,
            'commerce.c2c' => true,
            'commerce.wallet' => true,
            'commerce.variants' => true,
            'cafe.menu' => true,
            'marketing.coupons' => true,
            'users.customers' => true,
            'core.dashboard' => true,
            'bots.bale' => true,
            'sms-panel.panel' => true,
        ]);
        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
        $this->customer = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'customer',
            'wallet_balance_minor' => 50000,
        ]);
    }

    public function test_staff_cannot_turn_an_unpaid_order_into_wallet_debt(): void
    {
        $order = $this->pendingOrder();
        $before = (int) $this->customer->wallet_balance_minor;

        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$order->id, [
            'payment_tender' => 'wallet',
            'status' => 'paid',
        ])->assertStatus(422);

        $this->assertSame('pending_payment', $order->fresh()->status);
        $this->assertNotSame('wallet', (string) $order->fresh()->payment_tender);
        $this->assertSame($before, (int) $this->customer->fresh()->wallet_balance_minor);
        $this->assertSame(0, WalletLedger::query()->where('user_id', $this->customer->id)->where('direction', 'debit')->count());
    }

    public function test_bot_webhook_requires_the_tenant_secret(): void
    {
        $other = $this->createTenant(['domain' => 'other-bot.test', 'slug' => 'other-bot']);
        BotSetting::query()->create([
            'tenant_id' => $this->tenant->id,
            'provider' => 'telegram',
            'enabled' => true,
            'webhook_secret' => 'secret-a',
        ]);
        BotSetting::query()->create([
            'tenant_id' => $other->id,
            'provider' => 'telegram',
            'enabled' => true,
            'webhook_secret' => 'secret-b',
        ]);

        $payload = ['message' => ['chat' => ['id' => 42], 'text' => 'hi', 'from' => ['id' => 1]]];
        $this->postJson('/api/v1/public/bots/telegram/webhook', $payload)->assertNotFound();
        $this->postJson('/api/v1/public/bots/telegram/webhook?secret=nope', $payload)->assertNotFound();
        $this->postJson('/api/v1/public/bots/telegram/webhook?secret=secret-b', $payload)->assertNotFound();
        $this->postJson('/api/v1/public/bots/telegram/webhook', $payload, [
            'X-Bot-Secret' => 'secret-b',
        ])->assertOk();

        $this->assertDatabaseHas('bot_sessions', ['tenant_id' => $other->id, 'chat_id' => '42']);
        $this->assertDatabaseMissing('bot_sessions', ['tenant_id' => $this->tenant->id, 'chat_id' => '42']);

        $this->actingAs($this->admin, 'sanctum');
        $this->getJson('/api/v1/bots/bale/settings')
            ->assertOk()
            ->assertJsonMissingPath('data.webhook_secret')
            ->assertJsonPath('data.has_webhook_secret', true);
    }

    public function test_orders_own_cannot_read_someone_elses_order(): void
    {
        $seller = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'seller',
        ]);
        $foreign = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->customer->id,
            'created_by' => $this->admin->id,
            'status' => 'pending_payment',
            'total_minor' => 1000,
            'currency' => 'IRR',
            'number' => 'FOREIGN-1',
        ]);

        $this->actingAs($seller, 'sanctum');
        $this->getJson('/api/v1/orders/'.$foreign->id)->assertNotFound();
        $this->getJson('/api/v1/orders')->assertOk()->assertJsonPath('meta.total', 0);

        $own = $this->postJson('/api/v1/orders', [
            'items' => [['product_id' => $this->product()->id, 'quantity' => 1]],
            'customer_name' => 'Mine',
            'payment_tender' => 'cash',
            'status' => 'pending_payment',
        ])->assertCreated()->json('data.id');

        $this->getJson('/api/v1/orders/'.$own)->assertOk();
        $this->assertSame($seller->id, (int) Order::query()->find($own)->created_by);
    }

    public function test_card_to_card_cannot_mark_an_arbitrary_order_paid(): void
    {
        $cash = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'pending_payment',
            'total_minor' => 4000,
            'currency' => 'IRR',
            'payment_tender' => 'cash',
            'number' => 'CASH-1',
        ]);
        $cancelled = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'cancelled',
            'total_minor' => 4000,
            'currency' => 'IRR',
            'payment_tender' => 'card_to_card',
            'c2c_status' => 'pending',
            'number' => 'C2C-CANCEL',
        ]);

        $this->actingAs($this->admin, 'sanctum');
        $this->postJson('/api/v1/c2c/receipts/'.$cash->id, ['action' => 'approve'])->assertStatus(422);
        $this->assertSame('pending_payment', $cash->fresh()->status);
        $this->assertNull($cash->fresh()->c2c_status);

        $this->postJson('/api/v1/c2c/receipts/'.$cancelled->id, ['action' => 'approve'])->assertStatus(422);
        $this->assertSame('cancelled', $cancelled->fresh()->status);
        $this->assertSame('pending', $cancelled->fresh()->c2c_status);
    }

    public function test_gateway_return_does_not_burn_or_pay_a_mismatched_authority(): void
    {
        $order = $this->pendingOrder();
        PaymentIntent::query()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->id,
            'provider' => 'zarinpal',
            'status' => 'created',
            'meta' => ['zarinpal_authority' => 'AUTH-REAL'],
        ]);

        $this->get('/api/v1/payments/callback/zarinpal/'.$order->id);
        $this->assertSame('pending_payment', $order->fresh()->status);

        $this->get('/api/v1/payments/callback/zarinpal/'.$order->id.'?Authority=AUTH-OTHER&Status=OK');
        $this->assertSame('pending_payment', $order->fresh()->status);

        $this->get('/api/v1/payments/callback/zarinpal/'.$order->id.'?Authority=AUTH-REAL&Status=NOK');
        $this->assertSame('payment_failed', $order->fresh()->status);
    }

    public function test_checkout_rejects_a_fake_shipping_method_and_oversell(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $zoneId = $this->postJson('/api/v1/shipping/zones', ['name' => 'Iran'])->assertCreated()->json('data.zone.id');
        $this->postJson("/api/v1/shipping/zones/{$zoneId}/methods", ['method_id' => 'flat_rate'])->assertCreated();

        $product = $this->product(['manage_stock' => true, 'stock' => 1, 'price_minor' => 2500]);
        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $this->postJson('/api/v1/checkout', [
            'shipping_instance_id' => 99999,
            'shipping_minor' => 0,
        ])->assertStatus(422);
        $this->assertSame(0, Order::query()->where('user_id', $this->customer->id)->count());

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $this->postJson('/api/v1/checkout', ['shipping_instance_id' => 99999, 'shipping_minor' => 0])->assertStatus(422);

        \App\Models\CartItem::query()->where('product_id', $product->id)->update(['quantity' => 2]);
        $this->postJson('/api/v1/checkout')->assertStatus(422);
        $this->assertSame(1, (int) $product->fresh()->stock);
    }

    public function test_second_paid_order_cannot_oversell_the_last_unit(): void
    {
        $product = $this->product(['manage_stock' => true, 'stock' => 1]);
        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $first = $this->postJson('/api/v1/checkout')->assertCreated()->json('data.id');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $second = $this->postJson('/api/v1/checkout')->assertCreated()->json('data.id');

        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$first, ['status' => 'paid'])->assertOk();
        $this->patchJson('/api/v1/orders/'.$second, ['status' => 'paid'])->assertStatus(422);

        $this->assertSame('paid', Order::query()->find($first)->status);
        $this->assertSame('pending_payment', Order::query()->find($second)->status);
        $this->assertSame(0, (int) $product->fresh()->stock);
    }

    public function test_returned_and_deleted_sales_restore_stock_wallet_and_coupon(): void
    {
        $product = $this->product(['manage_stock' => true, 'stock' => 5, 'price_minor' => 8000]);
        $coupon = Coupon::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => 'BACK',
            'type' => 'fixed_cart',
            'amount' => 0,
            'status' => 'publish',
            'usage_limit' => 5,
        ]);
        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $orderId = $this->postJson('/api/v1/checkout', [
            'payment_method' => 'wallet',
            'coupon_code' => 'BACK',
        ])->assertCreated()->json('data.id');
        $this->assertSame(4, (int) $product->fresh()->stock);
        $this->assertSame(1, (int) $coupon->fresh()->usage_count);

        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$orderId, ['status' => 'processing'])->assertOk();
        $this->patchJson('/api/v1/orders/'.$orderId, ['status' => 'shipped'])->assertOk();
        $this->patchJson('/api/v1/orders/'.$orderId, ['status' => 'webino-returned'])->assertOk();
        $this->assertSame(5, (int) $product->fresh()->stock);
        $this->assertSame(50000, (int) $this->customer->fresh()->wallet_balance_minor);

        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $paid = $this->postJson('/api/v1/checkout', [
            'payment_method' => 'wallet',
            'coupon_code' => 'BACK',
        ])->assertCreated()->json('data.id');
        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$paid, ['status' => 'paid'])->assertOk();
        $this->assertSame(2, (int) $coupon->fresh()->usage_count);
        $returnId = $this->postJson('/api/v1/orders/'.$paid.'/returns', [
            'refund_minor' => 999999,
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', ['action' => 'approve'])->assertOk();
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', ['action' => 'receive'])->assertOk();
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', [
            'action' => 'refund',
            'refund_minor' => 999999,
        ])->assertOk();
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', ['action' => 'refund'])->assertStatus(422);
        $this->assertSame('refunded', Order::query()->find($paid)->status);
        $this->assertSame(1, (int) $coupon->fresh()->usage_count);
        $this->assertSame(1, WalletLedger::query()->where('ref_type', 'order_return')->where('ref_id', $returnId)->count());

        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $deletable = $this->postJson('/api/v1/checkout')->assertCreated()->json('data.id');
        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$deletable, ['status' => 'paid'])->assertOk();
        $stockAfterPaid = (int) $product->fresh()->stock;
        $this->deleteJson('/api/v1/orders/'.$deletable)->assertNoContent();
        $this->assertSame($stockAfterPaid + 1, (int) $product->fresh()->stock);
    }

    public function test_partial_return_does_not_mark_the_order_refunded(): void
    {
        $product = $this->product(['manage_stock' => true, 'stock' => 4, 'price_minor' => 3000]);
        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 2])->assertOk();
        $orderId = $this->postJson('/api/v1/checkout')->assertCreated()->json('data.id');
        $this->actingAs($this->admin, 'sanctum');
        $this->patchJson('/api/v1/orders/'.$orderId, ['status' => 'paid'])->assertOk();
        $returnId = $this->postJson('/api/v1/orders/'.$orderId.'/returns', [
            'refund_minor' => 999999,
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', ['action' => 'approve'])->assertOk();
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', ['action' => 'receive'])->assertOk();
        $this->postJson('/api/v1/order-returns/'.$returnId.'/action', [
            'action' => 'refund',
            'refund_minor' => 999999,
        ])->assertOk();

        $order = Order::query()->find($orderId);
        $this->assertSame('paid', $order->status);
        $this->assertLessThanOrEqual(6000, (int) $order->meta['partial_refund_minor']);
    }

    public function test_weak_roles_cannot_apply_updates_or_read_revenue(): void
    {
        $author = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'author',
        ]);
        $this->actingAs($author, 'sanctum');
        $this->postJson('/api/v1/updates/apply')->assertForbidden();
        $this->postJson('/api/v1/modules/commerce/install')->assertForbidden();
        $this->getJson('/api/v1/analytics/summary')->assertForbidden();
        $this->getJson('/api/v1/dashboard/sms-panel')->assertForbidden();

        $this->actingAs($this->admin, 'sanctum');
        $this->getJson('/api/v1/analytics/summary')->assertOk()->assertJsonStructure(['data' => ['revenue_minor']]);
    }

    public function test_wallet_balance_goes_through_the_ledger_and_admin_role_is_locked(): void
    {
        $staff = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'staff',
        ]);
        $this->actingAs($staff, 'sanctum');
        $created = $this->postJson('/api/v1/users', [
            'name' => 'Buyer',
            'email' => 'buyer-reaudit@example.test',
            'wallet_balance_minor' => 1500,
            'role' => 'customer',
        ])->assertCreated()->json('data');
        $buyer = User::query()->find($created['id'] ?? $created['user']['id'] ?? null);
        if (! $buyer) {
            $buyer = User::query()->where('email', 'buyer-reaudit@example.test')->firstOrFail();
        }
        $this->assertSame(1500, (int) $buyer->wallet_balance_minor);
        $this->assertSame(1, WalletLedger::query()->where('user_id', $buyer->id)->where('direction', 'credit')->count());

        $this->patchJson('/api/v1/users/'.$buyer->id, ['role' => 'admin'])->assertStatus(422);
        $this->assertNotSame('admin', $buyer->fresh()->role);

        $this->patchJson('/api/v1/users/'.$this->customer->id, ['wallet_balance_minor' => 51000])->assertOk();
        $this->assertSame(51000, (int) $this->customer->fresh()->wallet_balance_minor);
        $this->assertTrue(WalletLedger::query()->where('user_id', $this->customer->id)->where('reason', 'admin_adjust')->exists());
    }

    public function test_guest_checkout_rejects_sold_out_and_storefront_hides_unavailable(): void
    {
        $sold = $this->product(['name' => 'Soup', 'is_sold_out' => false]);
        $hidden = $this->product(['name' => 'Hidden buy', 'is_available' => false]);
        $token = 'guest-reaudit';
        $this->postJson('/api/v1/public/cafe/cart/items', [
            'product_id' => $sold->id,
            'quantity' => 1,
            'guest_token' => $token,
        ], ['X-Tenant-Domain' => $this->tenant->domain])->assertOk();
        $sold->update(['is_sold_out' => true]);
        $this->postJson('/api/v1/public/cafe/checkout', [
            'guest_token' => $token,
            'table_number' => '2',
        ], ['X-Tenant-Domain' => $this->tenant->domain])->assertStatus(422);

        $names = collect($this->getJson('/api/v1/public/catalog', [
            'X-Tenant-Domain' => $this->tenant->domain,
        ])->assertOk()->json('data.items'))->pluck('name');
        $this->assertFalse($names->contains('Hidden buy'));
        $this->assertNotNull($hidden->id);
    }

    public function test_coupon_password_is_hashed_and_omitted_from_the_api(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $id = $this->postJson('/api/v1/marketing/coupons', [
            'code' => 'SECRET',
            'type' => 'fixed_cart',
            'amount' => 10,
            'status' => 'publish',
            'visibility' => 'password',
            'password' => 'open-sesame',
        ])->assertCreated()->json('data.id');

        $row = Coupon::query()->find($id);
        $this->assertNotSame('open-sesame', $row->password);
        $this->assertTrue(password_verify('open-sesame', (string) $row->password));
        $this->getJson('/api/v1/marketing/coupons/'.$id)
            ->assertOk()
            ->assertJsonMissingPath('data.password');
    }

    /** @param  array<string, mixed>  $extra */
    private function product(array $extra = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => $extra['name'] ?? 'Item '.uniqid(),
            'slug' => 'item-'.uniqid(),
            'price_minor' => 10000,
            'currency' => 'IRR',
            'status' => 'publish',
            'is_available' => true,
            'is_hidden' => false,
            'is_sold_out' => false,
            'manage_stock' => false,
            'stock' => 10,
        ], $extra));
    }

    private function pendingOrder(): Order
    {
        return Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->customer->id,
            'created_by' => $this->admin->id,
            'status' => 'pending_payment',
            'total_minor' => 8000,
            'currency' => 'IRR',
            'payment_tender' => 'online',
            'number' => 'PEND-'.uniqid(),
        ]);
    }
}
