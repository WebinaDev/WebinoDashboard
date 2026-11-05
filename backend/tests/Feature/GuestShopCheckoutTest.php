<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Shipping\ShippingZonesService;
use App\Services\Shop\ShopSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class GuestShopCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    /** @var array<string, string> */
    private array $h;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->tenant = $this->createTenant(['domain' => 'guestshop.test', 'slug' => 'guestshop']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
            'commerce.orders' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
        ShopSettings::saveGeneral($this->tenant->id, array_merge(ShopSettings::getGeneral($this->tenant->id), [
            'guest_checkout' => true,
        ]));
        app(PaymentGatewaySettingsService::class)->setGatewayEnabled($this->tenant->id, 'cod', true);

        $ship = app(ShippingZonesService::class);
        $cfg = $ship->defaults();
        $cfg['global']['enable_shipping'] = true;
        $cfg['zones'] = [[
            'id' => 1,
            'name' => 'ایران',
            'order' => 0,
            'locations' => [['type' => 'country', 'code' => 'IR']],
            'methods' => [
                [
                    'instance_id' => 1,
                    'method_id' => 'flat_rate',
                    'title' => 'تیپاکس',
                    'enabled' => true,
                    'settings' => ['cost' => 220000, 'original_method_id' => 'flat_rate'],
                ],
                [
                    'instance_id' => 2,
                    'method_id' => 'flat_rate',
                    'title' => 'پیک موتوری',
                    'enabled' => true,
                    'settings' => ['cost' => 85000, 'original_method_id' => 'flat_rate'],
                ],
            ],
        ]];
        $cfg['next_zone_id'] = 2;
        $cfg['next_method_id'] = 3;
        $ship->putConfig($this->tenant->id, $cfg);

        $this->product = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'کرم مهمان',
            'slug' => 'guest-cream-'.uniqid(),
            'price_minor' => 100000,
            'currency' => 'IRT',
            'status' => 'publish',
            'is_available' => true,
            'is_hidden' => false,
            'is_sold_out' => false,
            'manage_stock' => true,
            'stock' => 10,
            'stock_status' => 'instock',
        ]);
    }

    public function test_guest_checkout_blocked_when_setting_off(): void
    {
        ShopSettings::saveGeneral($this->tenant->id, array_merge(ShopSettings::getGeneral($this->tenant->id), [
            'guest_checkout' => false,
        ]));
        app(ModuleSettingsService::class)->put($this->tenant->id, 'settings', 'site.privacy', ['guest_checkout' => false]);

        $this->withHeaders($this->h)->postJson('/api/v1/public/shop/checkout', [
            'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
            'recipient_name' => 'مهمان تست',
            'customer_phone' => '09121234567',
            'shipping_instance_id' => 2,
            'shipping_city' => 'تهران',
            'shipping_state_code' => 'IR:THR',
            'address_line' => 'خیابان تست پلاک ۱',
        ])->assertForbidden();
    }

    public function test_guest_can_quote_ship_place_and_confirm_cod(): void
    {
        $quote = $this->withHeaders($this->h)->postJson('/api/v1/public/shop/shipping/quote', [
            'state_code' => 'IR:THR',
            'city' => 'تهران',
            'cart_subtotal_minor' => 100000,
            'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ])->assertOk()->json('rates');
        $this->assertCount(2, $quote);
        $this->assertSame(220000, (int) $quote[0]['cost_minor']);
        $this->assertSame(85000, (int) $quote[1]['cost_minor']);

        $opts = $this->withHeaders($this->h)->getJson('/api/v1/public/shop/checkout-options?mode=cash')->assertOk()->json('gateways');
        $this->assertTrue(collect($opts)->contains(fn ($g) => ($g['id'] ?? '') === 'cod'));

        $created = $this->withHeaders($this->h)->postJson('/api/v1/public/shop/checkout', [
            'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
            'recipient_name' => 'مهمان تست',
            'customer_phone' => '09121234567',
            'shipping_instance_id' => 2,
            'shipping_city' => 'تهران',
            'shipping_state_code' => 'IR:THR',
            'address_line' => 'خیابان تست پلاک ۱',
            'shipping_address' => 'مهمان تست، تهران، خیابان تست پلاک ۱',
        ])->assertCreated()->json('data');

        $this->assertNotEmpty($created['pay_token']);
        $order = Order::query()->findOrFail($created['id']);
        $this->assertNull($order->user_id);
        $this->assertSame(85000, (int) $order->shipping_minor);
        $this->assertTrue((bool) ($order->meta['guest_checkout'] ?? false));

        $this->withHeaders($this->h)->postJson('/api/v1/public/shop/payments/offline', [
            'order_id' => $created['id'],
            'provider' => 'cod',
            'pay_token' => $created['pay_token'],
        ])->assertOk()->assertJsonPath('data.payment_provider', 'cod');

        $this->assertSame('processing', $order->fresh()->status);
    }
}
