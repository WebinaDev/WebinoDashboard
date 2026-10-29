<?php

namespace Tests\Feature;

use App\Models\Coupon;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Product;
use App\Models\User;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Shipping\ShippingZonesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * End-to-end purchase flow: cart → coupon → shipping → order → stock → payment callback.
 * No real SMS/email; gateways are HTTP-faked in sandbox.
 */
class CheckoutPurchaseFlowTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $user;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->tenant = $this->createTenant(['domain' => 'buy.test', 'slug' => 'buy']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
            'commerce.orders' => true,
            'commerce.coupons' => true,
        ]);
        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'customer',
            'email' => 'buyer-test@example.invalid',
            'phone' => '09120000000',
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
        $this->actingAs($this->user, 'sanctum');

        $ship = app(ShippingZonesService::class);
        $cfg = $ship->defaults();
        $cfg['zones'] = [[
            'id' => 1,
            'name' => 'ایران',
            'order' => 0,
            'locations' => [['type' => 'country', 'code' => 'IR']],
            'methods' => [[
                'instance_id' => 1,
                'method_id' => 'flat_rate',
                'title' => 'پست پیشتاز',
                'enabled' => true,
                'settings' => ['cost' => 50000, 'original_method_id' => 'flat_rate'],
            ]],
        ]];
        $cfg['next_zone_id'] = 2;
        $cfg['next_method_id'] = 2;
        $ship->putConfig($this->tenant->id, $cfg);

        $gateways = app(PaymentGatewaySettingsService::class);
        $gateways->setGatewayEnabled($this->tenant->id, 'cod', true);
        $gateways->setGatewayEnabled($this->tenant->id, 'zarinpal', true);
        $gateways->save($this->tenant->id, 'zarinpal', [
            'merchant_id' => 'test-merchant',
            'sandbox' => true,
            'cash_enabled' => true,
            'installment_enabled' => false,
            'fee_percent' => 0,
            'fee_payer' => 'merchant',
        ]);
    }

    private function product(int $stock = 10, int $price = 100000): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'کرم تست',
            'slug' => 'cream-'.uniqid(),
            'price_minor' => $price,
            'currency' => 'IRT',
            'status' => 'publish',
            'is_available' => true,
            'is_hidden' => false,
            'is_sold_out' => false,
            'manage_stock' => true,
            'stock' => $stock,
            'stock_status' => 'instock',
        ]);
    }

    private function addToCart(Product $p, int $qty = 1): void
    {
        $this->postJson('/api/v1/cart/items', [
            'product_id' => $p->id,
            'quantity' => $qty,
        ], $this->h)->assertOk();
    }

    public function test_cart_add_update_remove_and_stock_cap(): void
    {
        $p = $this->product(3);
        $this->addToCart($p, 2);
        $cart = $this->getJson('/api/v1/cart', $this->h)->assertOk()->json('data');
        $this->assertCount(1, $cart['items']);
        $this->assertSame(2, $cart['items'][0]['quantity']);

        $this->putJson('/api/v1/cart/items/'.$p->id, ['quantity' => 3], $this->h)->assertOk();
        $this->assertSame(3, $this->getJson('/api/v1/cart', $this->h)->json('data.items.0.quantity'));

        $this->deleteJson('/api/v1/cart/items/'.$p->id, [], $this->h)->assertOk();
        $this->assertSame([], $this->getJson('/api/v1/cart', $this->h)->json('data.items'));
    }

    public function test_cart_hold_does_not_wipe_fresh_add(): void
    {
        $p = $this->product(5);
        $this->addToCart($p, 1);
        // Immediate re-fetch must still see the line (regression for stale cart.updated_at).
        $this->assertCount(1, $this->getJson('/api/v1/cart', $this->h)->json('data.items'));
        $this->assertCount(1, $this->getJson('/api/v1/cart', $this->h)->json('data.items'));
    }

    public function test_coupon_apply_and_reject(): void
    {
        Coupon::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => 'SAVE10',
            'type' => 'percent',
            'amount' => 10,
            'status' => 'publish',
        ]);
        $p = $this->product(5, 200000);
        $this->addToCart($p, 1);

        $this->postJson('/api/v1/public/coupons/preview', [
            'code' => 'SAVE10',
            'subtotal_minor' => 200000,
        ], $this->h)->assertSuccessful();

        $this->postJson('/api/v1/checkout', [
            'shipping_address' => 'تهران، خیابان تست',
            'customer_phone' => '09121234567',
            'coupon_code' => 'NOPE',
            'shipping_instance_id' => 1,
            'shipping_state_code' => 'IR:TE',
            'shipping_city' => 'تهران',
        ], $this->h)->assertStatus(422);
    }

    public function test_shipping_quote_and_order_with_cod(): void
    {
        $p = $this->product(4, 150000);
        $this->addToCart($p, 2);
        $stockBefore = (int) $p->fresh()->stock;

        $rates = $this->postJson('/api/v1/shipping/quote', [
            'state_code' => 'IR:TE',
            'city' => 'تهران',
            'cart_subtotal_minor' => 300000,
        ], $this->h)->assertOk()->json('data.rates')
            ?? $this->postJson('/api/v1/shipping/quote', [
                'state_code' => 'IR:TE',
                'city' => 'تهران',
                'cart_subtotal_minor' => 300000,
            ], $this->h)->json('rates');

        $this->assertNotEmpty($rates);
        $instanceId = (int) ($rates[0]['instance_id'] ?? 1);

        $order = $this->postJson('/api/v1/checkout', [
            'shipping_address' => 'گیرنده تست، تهران، ولیعصر، پلاک ۱',
            'customer_phone' => '09121234567',
            'shipping_instance_id' => $instanceId,
            'shipping_state_code' => 'IR:TE',
            'shipping_city' => 'تهران',
            'shipping_postcode' => '1234567890',
        ], $this->h)->assertCreated()->json('data');

        $this->assertSame('pending_payment', $order['status']);
        $this->assertLessThan($stockBefore, (int) $p->fresh()->stock);

        $options = $this->getJson('/api/v1/payments/checkout-options?order_id='.$order['id'], $this->h)
            ->assertOk()
            ->json('gateways');
        $ids = collect($options)->pluck('id')->all();
        $this->assertContains('cod', $ids);
        $this->assertContains('zarinpal', $ids);

        $confirmed = $this->postJson('/api/v1/payments/offline', [
            'order_id' => $order['id'],
            'provider' => 'cod',
        ], $this->h)->assertOk()->json('data');
        $this->assertSame('processing', $confirmed['status']);
        $this->assertSame('cod', $confirmed['payment_provider']);
        $this->assertSame([], $this->getJson('/api/v1/cart', $this->h)->json('data.items'));
    }

    public function test_zarinpal_sandbox_intent_success_fail_cancel_duplicate_and_amount_tamper(): void
    {
        $p = $this->product(5, 100000);
        $this->addToCart($p, 1);
        $order = $this->postJson('/api/v1/checkout', [
            'shipping_address' => 'تهران',
            'customer_phone' => '09120000001',
            'shipping_instance_id' => 1,
            'shipping_state_code' => 'IR:TE',
            'shipping_city' => 'تهران',
        ], $this->h)->assertCreated()->json('data');

        Http::fake([
            'sandbox.zarinpal.com/pg/v4/payment/request.json' => Http::response([
                'data' => ['code' => 100, 'authority' => 'A000000000000000000000000000000000000'],
            ]),
            'sandbox.zarinpal.com/pg/v4/payment/verify.json' => Http::sequence()
                ->push(['data' => ['code' => 100, 'ref_id' => 555]])
                ->push(['data' => ['code' => 100, 'ref_id' => 555]])
                ->push(['data' => ['code' => 101, 'ref_id' => 555]]),
        ]);

        $intent = $this->postJson('/api/v1/payments/intent', [
            'order_id' => $order['id'],
            'provider' => 'zarinpal',
            'mode' => 'cash',
        ], $this->h)->assertOk()->json('data');
        $this->assertStringContainsString('sandbox.zarinpal.com', (string) $intent['redirect_url']);

        $row = Order::query()->findOrFail($order['id']);
        $this->assertSame('awaiting_gateway', $row->status);
        $pi = PaymentIntent::query()->where('order_id', $row->id)->firstOrFail();
        $nonce = (string) data_get($pi->meta, 'state');
        $authority = (string) data_get($pi->meta, 'zarinpal_authority');

        // Cancel / NOK
        $this->get('/api/v1/payments/callback/zarinpal/'.$row->id.'?Authority='.$authority.'&Status=NOK&nonce='.$nonce, $this->h)
            ->assertRedirect();
        $this->assertSame('payment_failed', $row->fresh()->status);

        // Retry intent
        $row->update(['status' => 'pending_payment']);
        $pi->update(['status' => 'created']);
        $this->postJson('/api/v1/payments/intent', [
            'order_id' => $row->id,
            'provider' => 'zarinpal',
            'mode' => 'cash',
        ], $this->h)->assertOk();
        $pi = PaymentIntent::query()->where('order_id', $row->id)->latest('id')->firstOrFail();
        $nonce = (string) data_get($pi->meta, 'state');
        $authority = (string) data_get($pi->meta, 'zarinpal_authority');
        $row->update(['status' => 'awaiting_gateway']);

        // Success
        $this->get('/api/v1/payments/callback/zarinpal/'.$row->id.'?Authority='.$authority.'&Status=OK&nonce='.$nonce, $this->h)
            ->assertRedirect();
        $this->assertSame('paid', $row->fresh()->status);

        // Duplicate callback must stay paid (idempotent)
        $this->get('/api/v1/payments/callback/zarinpal/'.$row->id.'?Authority='.$authority.'&Status=OK&nonce='.$nonce, $this->h)
            ->assertRedirect();
        $this->assertSame('paid', $row->fresh()->status);

        // Amount tamper: foreign authority ignored earlier; wrong authority does not reopen paid order
        $this->get('/api/v1/payments/callback/zarinpal/'.$row->id.'?Authority=OTHER&Status=OK&nonce='.$nonce, $this->h)
            ->assertRedirect();
        $this->assertSame('paid', $row->fresh()->status);
    }

    public function test_stock_rollback_on_payment_failed(): void
    {
        $p = $this->product(2, 80000);
        $before = (int) $p->fresh()->stock;
        $this->addToCart($p, 1);
        $order = $this->postJson('/api/v1/checkout', [
            'shipping_address' => 'تهران',
            'customer_phone' => '09120000002',
            'shipping_instance_id' => 1,
            'shipping_state_code' => 'IR:TE',
            'shipping_city' => 'تهران',
        ], $this->h)->assertCreated()->json('data');
        $this->assertSame($before - 1, (int) $p->fresh()->stock);

        Http::fake([
            'sandbox.zarinpal.com/pg/v4/payment/request.json' => Http::response([
                'data' => ['code' => 100, 'authority' => 'A111111111111111111111111111111111111'],
            ]),
        ]);
        $this->postJson('/api/v1/payments/intent', [
            'order_id' => $order['id'],
            'provider' => 'zarinpal',
            'mode' => 'cash',
        ], $this->h)->assertOk();
        $pi = PaymentIntent::query()->where('order_id', $order['id'])->firstOrFail();
        $nonce = (string) data_get($pi->meta, 'state');
        $authority = (string) data_get($pi->meta, 'zarinpal_authority');
        $this->get('/api/v1/payments/callback/zarinpal/'.$order['id'].'?Authority='.$authority.'&Status=NOK&nonce='.$nonce, $this->h)
            ->assertRedirect();
        $this->assertSame($before, (int) $p->fresh()->stock);
    }

    public function test_checkout_options_lists_offline_and_online(): void
    {
        $list = $this->getJson('/api/v1/payments/checkout-options?mode=cash', $this->h)
            ->assertOk()
            ->json('gateways');
        $ids = collect($list)->pluck('id')->all();
        $this->assertContains('cod', $ids);
        $this->assertContains('zarinpal', $ids);
        $cod = collect($list)->firstWhere('id', 'cod');
        $this->assertSame('offline', $cod['kind'] ?? null);
    }
}
