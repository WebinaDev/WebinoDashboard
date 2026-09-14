<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WalletWithdrawal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrdersWalletPosApiTest extends TestCase
{
    use RefreshDatabase;

    protected function shopUser(): User
    {
        $tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop-ops',
            'domain' => 'shop-ops.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRR',
        ]);

        $this->enableSubmodules($tenant->id, [
            'commerce.orders' => true,
            'commerce.c2c' => true,
            'commerce.wallet' => true,
            'commerce.pos' => true,
            'commerce.catalog' => true,
        ]);

        /** @var User $user */
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'wallet_balance_minor' => 0,
        ]);

        return $user;
    }

    public function test_create_list_and_note_order(): void
    {
        $user = $this->shopUser();
        $this->actingAs($user, 'sanctum');

        $product = Product::query()->create([
            'tenant_id' => $user->tenant_id,
            'name' => 'Item',
            'slug' => 'item',
            'price_minor' => 10000,
            'currency' => 'IRR',
            'status' => 'publish',
        ]);

        $order = $this->postJson('/api/v1/orders', [
            'items' => [['product_id' => $product->id, 'quantity' => 2]],
            'customer_name' => 'Ali',
            'sales_channel' => 'phone',
            'payment_tender' => 'cash',
            'status' => 'processing',
        ])->assertCreated()->json('data');

        $this->assertSame(20000, $order['total_minor']);
        $this->assertNotEmpty($order['number']);

        $this->getJson('/api/v1/orders?search=Ali')
            ->assertOk()
            ->assertJsonPath('meta.stats.order_count', 1);

        $this->postJson('/api/v1/orders/'.$order['id'].'/notes', [
            'body' => 'Called customer',
        ])->assertCreated();

        $this->getJson('/api/v1/orders/'.$order['id'].'/print')
            ->assertOk()
            ->assertJsonStructure(['data' => ['html']]);
    }

    public function test_c2c_approve_receipt(): void
    {
        $user = $this->shopUser();
        $this->actingAs($user, 'sanctum');

        $order = Order::query()->create([
            'tenant_id' => $user->tenant_id,
            'number' => 'ORD-000001',
            'status' => 'pending_payment',
            'total_minor' => 5000,
            'currency' => 'IRR',
            'payment_tender' => 'card_to_card',
            'c2c_status' => 'pending',
            'customer_name' => 'Buyer',
        ]);

        $this->postJson('/api/v1/c2c/receipts/'.$order->id, [
            'action' => 'approve',
        ])->assertOk()
            ->assertJsonPath('data.c2c_status', 'approved')
            ->assertJsonPath('data.status', 'paid');
    }

    public function test_wallet_adjust_and_withdrawal_flow(): void
    {
        $user = $this->shopUser();
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/wallet/topup', [
            'user_id' => $user->id,
            'amount_minor' => 100000,
        ])->assertCreated();

        $this->assertSame(100000, $user->fresh()->wallet_balance_minor);

        $wd = $this->postJson('/api/v1/wallet/withdrawals', [
            'user_id' => $user->id,
            'amount_minor' => 40000,
            'sheba' => 'IR123',
        ])->assertCreated()->json('data');

        $this->assertSame(60000, $user->fresh()->wallet_balance_minor);

        $this->patchJson('/api/v1/wallet/withdrawals', [
            'id' => $wd['id'],
            'status' => 'rejected',
        ])->assertOk();

        $this->assertSame(100000, $user->fresh()->wallet_balance_minor);
        $this->assertSame('rejected', WalletWithdrawal::query()->find($wd['id'])->status);
    }

    public function test_pos_search_and_create(): void
    {
        $user = $this->shopUser();
        $this->actingAs($user, 'sanctum');

        Product::query()->create([
            'tenant_id' => $user->tenant_id,
            'name' => 'Barcode Item',
            'slug' => 'barcode-item',
            'sku' => 'SKU-1',
            'price_minor' => 2500,
            'currency' => 'IRR',
            'status' => 'publish',
        ]);

        $this->getJson('/api/v1/products/pos-search?q=SKU-1')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->postJson('/api/v1/pos/orders', [
            'items' => [['product_id' => Product::query()->first()->id, 'quantity' => 1]],
            'is_pos' => true,
            'payment_tender' => 'cash',
            'amount_paid_minor' => 3000,
            'sales_channel' => 'in_store',
        ])->assertCreated()
            ->assertJsonPath('data.is_pos', true);
    }

    public function test_order_statuses_include_awaiting_gateway(): void
    {
        $user = $this->shopUser();
        $this->actingAs($user, 'sanctum');

        $statuses = $this->getJson('/api/v1/orders/statuses')
            ->assertOk()
            ->json('data');

        $list = is_array($statuses) ? $statuses : [];
        $flat = array_map(static fn ($s) => is_array($s) ? ($s['slug'] ?? $s['status'] ?? null) : $s, $list);
        $this->assertContains('awaiting_gateway', $flat);
        $this->assertContains('processing', $flat);
    }
}
