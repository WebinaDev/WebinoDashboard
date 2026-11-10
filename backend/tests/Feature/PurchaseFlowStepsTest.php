<?php

namespace Tests\Feature;

use App\Models\GiftCard;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\GiftCards\GiftCardService;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Pricing\PricingSettings;
use App\Services\Shipping\ShippingZonesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Purchase flow: variants through cart and order, saved-for-later lines, gift cards,
 * pricing module off (single price), stepped checkout config and per-step endpoints.
 */
class PurchaseFlowStepsTest extends TestCase
{
    use RefreshDatabase;

    protected \App\Models\Tenant $tenant;

    protected User $user;

    protected array $h;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->tenant = $this->createTenant(['domain' => 'flow.test', 'slug' => 'flow', 'default_currency' => 'IRT']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
            'commerce.orders' => true,
            'commerce.coupons' => true,
            'commerce.pricing' => true,
            'marketing.coupons' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer', 'phone' => '09120000000']);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
        $this->actingAs($this->user, 'sanctum');

        $ship = app(ShippingZonesService::class);
        $cfg = $ship->defaults();
        $cfg['zones'] = [[
            'id' => 1, 'name' => 'ایران', 'order' => 0,
            'locations' => [['type' => 'country', 'code' => 'IR']],
            'methods' => [
                ['instance_id' => 1, 'method_id' => 'flat_rate', 'title' => 'پست', 'enabled' => true, 'settings' => ['cost' => 50000, 'original_method_id' => 'flat_rate']],
                ['instance_id' => 2, 'method_id' => 'flat_rate', 'title' => 'پیک', 'enabled' => true, 'settings' => ['cost' => 80000, 'original_method_id' => 'flat_rate']],
            ],
        ]];
        $cfg['next_zone_id'] = 2;
        $cfg['next_method_id'] = 3;
        $ship->putConfig($this->tenant->id, $cfg);
        app(PaymentGatewaySettingsService::class)->setGatewayEnabled($this->tenant->id, 'cod', true);
    }

    protected function product(array $attrs = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id, 'name' => 'تی‌شرت', 'slug' => 'p-'.uniqid(),
            'price_minor' => 100000, 'currency' => 'IRT', 'status' => 'publish',
            'is_available' => true, 'is_hidden' => false, 'is_sold_out' => false,
            'manage_stock' => true, 'stock' => 10, 'stock_status' => 'instock',
        ], $attrs));
    }

    protected function variant(Product $p, array $attrs = []): ProductVariant
    {
        return ProductVariant::query()->create(array_merge([
            'tenant_id' => $this->tenant->id, 'product_id' => $p->id, 'name' => 'آبی',
            'price_minor' => 120000, 'manage_stock' => true, 'stock' => 5, 'stock_status' => 'instock',
        ], $attrs));
    }

    protected function checkoutPayload(array $extra = []): array
    {
        return array_merge([
            'shipping_address' => 'تهران، خیابان آزادی',
            'customer_phone' => '09121234567',
            'recipient_name' => 'خریدار',
            'address_line' => 'خیابان آزادی پلاک ۱',
            'shipping_instance_id' => 1,
            'shipping_state_code' => 'IR:TE',
            'shipping_city' => 'تهران',
        ], $extra);
    }

    public function test_variants_flow_through_cart_and_order(): void
    {
        $p = $this->product();
        $blue = $this->variant($p, ['name' => 'آبی', 'price_minor' => 120000]);
        $red = $this->variant($p, ['name' => 'قرمز', 'price_minor' => 150000, 'sale_price_minor' => 130000, 'stock' => 3]);

        // A product with variants and no default needs a choice.
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id], $this->h)->assertStatus(422)->assertJsonValidationErrors('variant_id');
        // A foreign variant id is rejected.
        $other = $this->variant($this->product());
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id, 'variant_id' => $other->id], $this->h)->assertStatus(422);

        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id, 'variant_id' => $blue->id, 'quantity' => 1], $this->h)->assertOk();
        $cart = $this->postJson('/api/v1/cart/items', ['product_id' => $p->id, 'variant_id' => $red->id, 'quantity' => 2], $this->h)->assertOk()->json('data');
        $this->assertCount(2, $cart['items']);
        $lines = collect($cart['pricing']['lines'])->keyBy('product_variant_id');
        $this->assertSame(120000, $lines[$blue->id]['unit_price_minor']);
        $this->assertSame(130000, $lines[$red->id]['unit_price_minor']);
        $this->assertSame(150000, $lines[$red->id]['regular_price_minor']);
        $this->assertTrue($lines[$red->id]['on_sale']);
        $this->assertSame(120000 + 260000, $cart['pricing']['subtotal_minor']);

        // Over the variant stock is refused.
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id, 'variant_id' => $red->id, 'quantity' => 2], $this->h)->assertStatus(422);
        // Line endpoints address one variant line.
        $redLine = collect($cart['items'])->firstWhere('product_variant_id', $red->id);
        $this->putJson('/api/v1/cart/lines/'.$redLine['id'], ['quantity' => 3], $this->h)->assertOk();

        $order = $this->postJson('/api/v1/checkout', $this->checkoutPayload(), $this->h)->assertCreated()->json('data');
        $items = collect($order['items'])->keyBy('product_variant_id');
        $this->assertSame(120000, (int) $items[$blue->id]['unit_price_minor']);
        $this->assertSame(130000, (int) $items[$red->id]['unit_price_minor']);
        $this->assertSame(3, (int) $items[$red->id]['quantity']);
        $this->assertSame(120000 + 390000, (int) $order['subtotal_minor']);
        $this->assertSame(0, (int) $red->fresh()->stock);
        $this->assertSame(4, (int) $blue->fresh()->stock);
    }

    public function test_default_variant_is_used_and_saved_for_later_lines_are_not_bought(): void
    {
        $p = $this->product();
        $def = $this->variant($p, ['is_default' => true, 'price_minor' => 90000]);
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id], $this->h)->assertOk()
            ->assertJsonPath('data.items.0.product_variant_id', $def->id);

        $later = $this->product(['price_minor' => 70000]);
        $this->postJson('/api/v1/cart/items', ['product_id' => $later->id], $this->h)->assertOk();
        $this->postJson('/api/v1/cart/items/'.$later->id.'/save-for-later', [], $this->h)->assertOk();

        $order = $this->postJson('/api/v1/checkout', $this->checkoutPayload(), $this->h)->assertCreated()->json('data');
        $this->assertCount(1, $order['items']);
        $this->assertSame(90000, (int) $order['subtotal_minor']);
    }

    public function test_gift_card_partial_then_release_on_cancel(): void
    {
        $card = app(GiftCardService::class)->issue($this->tenant->id, ['amount_minor' => 60000, 'code' => 'gift-1234-abcd']);
        $this->assertSame('GIFT1234ABCD', $card->code);

        $this->postJson('/api/v1/public/gift-cards/balance', ['code' => 'gift1234abcd'], $this->h)->assertOk()
            ->assertJsonPath('data.balance_minor', 60000);
        $this->postJson('/api/v1/public/gift-cards/balance', ['code' => 'NOPE'], $this->h)->assertNotFound();

        $p = $this->product(['price_minor' => 100000]);
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id], $this->h)->assertOk();
        $order = $this->postJson('/api/v1/checkout', $this->checkoutPayload(['gift_card_code' => 'GIFT1234ABCD']), $this->h)->assertCreated()->json('data');
        // 100000 + 50000 shipping - 60000 gift card
        $this->assertSame(90000, (int) $order['total_minor']);
        $this->assertSame(60000, (int) $order['meta']['gift_card']['amount_minor']);
        $this->assertSame('pending_payment', $order['status']);
        $this->assertSame(0, (int) $card->fresh()->balance_minor);

        $row = Order::query()->findOrFail($order['id']);
        app(\App\Services\Orders\OrderStatusService::class)->apply($row, 'cancelled');
        $this->assertSame(60000, (int) $card->fresh()->balance_minor);
        $this->assertSame(['issue', 'redeem', 'release'], $card->transactions()->reorder('id')->pluck('type')->all());
    }

    public function test_gift_card_covering_whole_order_marks_it_paid(): void
    {
        app(GiftCardService::class)->issue($this->tenant->id, ['amount_minor' => 500000, 'code' => 'BIGCARD']);
        $p = $this->product(['price_minor' => 100000]);
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id], $this->h)->assertOk();
        $order = $this->postJson('/api/v1/checkout', $this->checkoutPayload(['gift_card_code' => 'BIGCARD']), $this->h)->assertCreated()->json('data');
        $this->assertSame(0, (int) $order['total_minor']);
        $this->assertSame('paid', $order['status']);
        $this->assertSame('gift_card', $order['payment_provider']);
        $this->assertSame(350000, (int) GiftCard::query()->where('code', 'BIGCARD')->value('balance_minor'));
    }

    public function test_expired_or_disabled_gift_card_is_rejected(): void
    {
        app(GiftCardService::class)->issue($this->tenant->id, ['amount_minor' => 1000, 'code' => 'OLD', 'expires_at' => now()->subDay()]);
        $p = $this->product();
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id], $this->h)->assertOk();
        $this->postJson('/api/v1/checkout', $this->checkoutPayload(['gift_card_code' => 'OLD']), $this->h)
            ->assertStatus(422)->assertJsonValidationErrors('gift_card_code');
        $this->assertSame(0, Order::query()->count());
    }

    public function test_admin_gift_card_crud_and_adjust(): void
    {
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $id = $this->postJson('/api/v1/marketing/gift-cards', ['amount_minor' => 200000, 'recipient_name' => 'سارا'], $this->h)
            ->assertCreated()->json('data.id');
        $this->postJson('/api/v1/marketing/gift-cards/'.$id.'/adjust', ['direction' => 'debit', 'amount_minor' => 50000, 'note' => 'اصلاح'], $this->h)
            ->assertOk()->assertJsonPath('data.balance_minor', 150000);
        $this->postJson('/api/v1/marketing/gift-cards/'.$id.'/adjust', ['direction' => 'debit', 'amount_minor' => 999999], $this->h)->assertStatus(422);
        $this->putJson('/api/v1/marketing/gift-cards/'.$id, ['status' => 'disabled'], $this->h)->assertOk()->assertJsonPath('data.status', 'disabled');
        $this->getJson('/api/v1/marketing/gift-cards', $this->h)->assertOk()->assertJsonPath('meta.total', 1);
    }

    public function test_pricing_module_off_means_one_unit_price_everywhere(): void
    {
        PricingSettings::saveSection($this->tenant->id, 'wholesale', ['enabled' => true, 'discount_percent' => 30]);
        PricingSettings::saveSection($this->tenant->id, 'credit', ['enabled' => true, 'increase_percent' => 10]);
        $p = $this->product(['price_minor' => 240000, 'purchase_price_minor' => 200000]);

        $on = $this->postJson('/api/v1/cart/items', ['product_id' => $p->id, 'purchase_type' => 'wholesale'], $this->h)->assertOk()->json('data.pricing');
        $this->assertSame('wholesale', $on['purchase_type']);
        $this->assertNotSame(240000, $on['subtotal_minor']);

        PricingSettings::saveSection($this->tenant->id, 'general', ['enabled' => false]);
        $off = $this->putJson('/api/v1/cart/purchase-type', ['purchase_type' => 'wholesale'], $this->h)->assertOk()->json('data.pricing');
        $this->assertSame('cash', $off['purchase_type']);
        $this->assertSame(['cash'], $off['available_types']);
        $this->assertTrue($off['single_price']);
        $this->assertSame(240000, $off['subtotal_minor']);

        $detail = $this->getJson('/api/v1/public/catalog/items/'.$p->slug, $this->h)->assertOk()->json('data');
        $this->assertEmpty($detail['pricing'] ?? null);

        $order = $this->postJson('/api/v1/checkout', $this->checkoutPayload(), $this->h)->assertCreated()->json('data');
        $this->assertSame(240000, (int) $order['items'][0]['unit_price_minor']);
        $this->assertSame('cash', $order['items'][0]['purchase_type']);
    }

    public function test_stepped_checkout_validates_each_step_and_recalculates_totals(): void
    {
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $saved = $this->putJson('/api/v1/shop/checkout-flow', ['data' => [
            'steps' => [['key' => 'delivery_time', 'enabled' => true, 'label' => 'زمان ارسال — تحویل']],
            'fields' => ['address' => [['key' => 'customer_national_id', 'enabled' => false]]],
            'delivery_time' => ['mode' => 'methods', 'shipping_methods' => [2], 'closed_weekdays' => []],
        ]], $this->h)->assertOk()->json('data.settings');
        $dt = collect($saved['steps'])->firstWhere('key', 'delivery_time');
        $this->assertTrue($dt['enabled']);
        $this->assertStringNotContainsString('—', $dt['label']);

        $this->actingAs($this->user, 'sanctum');
        $cfg = $this->getJson('/api/v1/checkout/config', $this->h)->assertOk()->json('data');
        $this->assertSame(['address', 'shipping', 'delivery_time', 'payment'], array_column($cfg['steps'], 'key'));
        $this->assertNotEmpty($cfg['delivery_time']['days']);
        $this->assertTrue(collect($cfg['gateways'])->contains('id', 'cod'));
        $this->assertFalse(collect($cfg['fields']['address'])->contains('key', 'customer_national_id'));

        $p = $this->product(['price_minor' => 100000]);
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id, 'quantity' => 2], $this->h)->assertOk();

        $this->postJson('/api/v1/checkout/steps/address', ['customer_phone' => '09121234567'], $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['recipient_name', 'address_line']);
        $addr = $this->postJson('/api/v1/checkout/steps/address', [
            'recipient_name' => 'علی', 'customer_phone' => '09121234567', 'shipping_state_code' => 'IR:THR',
            'shipping_city' => 'تهران', 'address_line' => 'خیابان یک', 'shipping_postcode' => '1234567890',
        ], $this->h)->assertOk()->json('data');
        $this->assertSame(200000, $addr['totals']['subtotal_minor']);
        $this->assertCount(2, $addr['totals']['shipping_rates']);
        $this->assertTrue(collect($addr['totals']['shipping_rates'])->firstWhere('instance_id', 2)['delivery_time_required']);
        $this->assertSame('shipping', $addr['next_step']);

        $this->postJson('/api/v1/checkout/steps/shipping', ['shipping_instance_id' => 999], $this->h)->assertStatus(422);
        $ship = $this->postJson('/api/v1/checkout/steps/shipping', ['shipping_instance_id' => 1], $this->h)->assertOk()->json('data');
        $this->assertSame(50000, $ship['totals']['shipping_minor']);
        $this->assertSame('payment', $ship['next_step']);
        $this->assertFalse($ship['totals']['delivery_time_required'], 'delivery time does not apply to method 1');

        $ship = $this->postJson('/api/v1/checkout/steps/shipping', ['shipping_instance_id' => 2], $this->h)->assertOk()->json('data');
        $this->assertTrue($ship['totals']['delivery_time_required']);
        $this->assertSame('delivery_time', $ship['next_step']);
        $this->postJson('/api/v1/checkout/steps/delivery_time', [], $this->h)->assertStatus(422)->assertJsonValidationErrors(['delivery_date']);
        $day = $cfg['delivery_time']['days'][0];
        $this->postJson('/api/v1/checkout/steps/delivery_time', ['delivery_date' => $day['date'], 'delivery_slot' => $day['slots'][0]['id']], $this->h)->assertOk();

        $card = app(GiftCardService::class)->issue($this->tenant->id, ['amount_minor' => 30000]);
        $this->postJson('/api/v1/checkout/steps/payment', ['gift_card_code' => 'NOPE-NOPE'], $this->h)->assertStatus(422)->assertJsonValidationErrors(['gift_card_code']);
        $pay = $this->postJson('/api/v1/checkout/steps/payment', ['payment_gateway' => 'cod', 'gift_card_code' => $card->code], $this->h)->assertOk()->json('data');
        $this->assertSame(280000, $pay['totals']['total_before_gift_card_minor']);
        $this->assertSame(30000, $pay['totals']['gift_card_minor']);
        $this->assertSame(250000, $pay['totals']['total_minor']);
        $this->assertNull($pay['next_step']);

        $session = $this->getJson('/api/v1/checkout/session', $this->h)->assertOk()->json('data');
        $this->assertSame(2, $session['values']['shipping_instance_id']);

        // Order creation falls back to the saved step values.
        $order = $this->postJson('/api/v1/checkout', [], $this->h)->assertCreated()->json('data');
        $this->assertSame(250000, (int) $order['total_minor']);
        $this->assertSame($day['date'], $order['meta']['delivery_time']['date']);
    }

    public function test_guest_stepped_checkout_and_config(): void
    {
        \App\Services\Shop\ShopSettings::saveGeneral($this->tenant->id, array_merge(\App\Services\Shop\ShopSettings::getGeneral($this->tenant->id), ['guest_checkout' => true]));
        auth()->forgetGuards();
        $this->app['auth']->guard('sanctum')->forgetUser();
        $p = $this->product(['price_minor' => 100000]);
        $v = $this->variant($p, ['price_minor' => 150000]);
        $this->getJson('/api/v1/public/shop/checkout-config', $this->h)->assertOk()->assertJsonPath('data.guest_checkout', true);
        $res = $this->postJson('/api/v1/public/shop/checkout/steps/shipping', [
            'items' => [['product_id' => $p->id, 'variant_id' => $v->id, 'quantity' => 1]],
            'values' => ['shipping_state_code' => 'IR:THR', 'shipping_city' => 'تهران'],
            'shipping_instance_id' => 1,
        ], $this->h)->assertOk()->json('data.totals');
        $this->assertSame(150000, $res['subtotal_minor']);
        $this->assertSame(200000, $res['total_minor']);
    }


    public function test_payment_preview_returns_totals_without_terms_and_surfaces_code_errors(): void
    {
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $this->putJson('/api/v1/shop/checkout-flow', ['data' => [
            'fields' => ['payment' => [['key' => 'terms', 'enabled' => true, 'required' => true]]],
        ]], $this->h)->assertOk();

        $this->actingAs($this->user, 'sanctum');
        $p = $this->product(['price_minor' => 100000]);
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id], $this->h)->assertOk();
        $this->postJson('/api/v1/checkout/steps/address', [
            'recipient_name' => 'علی', 'customer_phone' => '09121234567',
            'shipping_state_code' => 'IR:THR', 'shipping_city' => 'تهران', 'address_line' => 'خیابان یک',
        ], $this->h)->assertOk();
        $this->postJson('/api/v1/checkout/steps/shipping', ['shipping_instance_id' => 1], $this->h)->assertOk();

        $this->postJson('/api/v1/checkout/steps/payment', ['payment_gateway' => 'cod', 'gift_card_code' => 'NOPE'], $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['terms_accepted', 'gift_card_code']);

        $preview = $this->postJson('/api/v1/checkout/steps/payment', [
            'preview' => true,
            'payment_gateway' => 'cod',
            'coupon_code' => 'NO-SUCH',
            'gift_card_code' => 'NOPE-NOPE',
        ], $this->h)->assertOk()->json('data');
        $this->assertTrue($preview['preview']);
        $this->assertFalse($preview['valid']);
        $this->assertSame(150000, $preview['totals']['total_minor']);
        $this->assertNotEmpty($preview['errors']['coupon_code']);
        $this->assertNotEmpty($preview['errors']['gift_card_code']);
        $this->assertSame($preview['errors']['coupon_code'], $preview['totals']['coupon_error']);
        $this->assertArrayNotHasKey('terms_accepted', $preview['errors']);
        $this->assertNotContains('payment', $this->getJson('/api/v1/checkout/session', $this->h)->json('data.completed'));

        $card = app(GiftCardService::class)->issue($this->tenant->id, ['amount_minor' => 20000]);
        $ok = $this->postJson('/api/v1/checkout/steps/payment', [
            'preview' => true,
            'payment_gateway' => 'cod',
            'gift_card_code' => $card->code,
        ], $this->h)->assertOk()->json('data');
        $this->assertTrue($ok['valid']);
        $this->assertSame(20000, $ok['totals']['gift_card_minor']);
        $this->assertSame(130000, $ok['totals']['total_minor']);
        $this->assertSame([], (array) $ok['errors']);
        $this->assertSame(20000, (int) $card->fresh()->balance_minor, 'preview must not redeem the card');

        $this->postJson('/api/v1/checkout/steps/payment', [
            'payment_gateway' => 'cod',
            'gift_card_code' => $card->code,
            'terms_accepted' => true,
        ], $this->h)->assertOk();
        $this->assertContains('payment', $this->getJson('/api/v1/checkout/session', $this->h)->json('data.completed'));
    }

    public function test_guest_payment_preview_and_methods_mode_step_order(): void
    {
        \App\Services\Shop\ShopSettings::saveGeneral($this->tenant->id, array_merge(\App\Services\Shop\ShopSettings::getGeneral($this->tenant->id), ['guest_checkout' => true]));
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $this->putJson('/api/v1/shop/checkout-flow', ['data' => [
            'steps' => [['key' => 'delivery_time', 'enabled' => true]],
            'delivery_time' => ['mode' => 'methods', 'shipping_methods' => [2], 'closed_weekdays' => []],
            'fields' => ['payment' => [['key' => 'terms', 'enabled' => true, 'required' => true]]],
        ]], $this->h)->assertOk();

        auth()->forgetGuards();
        $this->app['auth']->guard('sanctum')->forgetUser();
        $p = $this->product(['price_minor' => 100000]);
        $items = [['product_id' => $p->id, 'quantity' => 1]];
        $cfg = $this->getJson('/api/v1/public/shop/checkout-config', $this->h)->assertOk()->json('data');
        $this->assertSame(['address', 'shipping', 'delivery_time', 'payment'], array_column($cfg['steps'], 'key'));

        $addr = $this->postJson('/api/v1/public/shop/checkout/steps/address', [
            'items' => $items,
            'recipient_name' => 'مهمان', 'customer_phone' => '09121234567',
            'shipping_state_code' => 'IR:THR', 'shipping_city' => 'تهران', 'address_line' => 'خیابان یک',
        ], $this->h)->assertOk()->json('data');
        $this->assertSame('shipping', $addr['next_step']);

        $ship = $this->postJson('/api/v1/public/shop/checkout/steps/shipping', [
            'items' => $items,
            'values' => $addr['values'],
            'shipping_instance_id' => 1,
        ], $this->h)->assertOk()->json('data');
        $this->assertSame('payment', $ship['next_step']);

        $need = $this->postJson('/api/v1/public/shop/checkout/steps/shipping', [
            'items' => $items,
            'values' => $addr['values'],
            'shipping_instance_id' => 2,
        ], $this->h)->assertOk()->json('data');
        $this->assertSame('delivery_time', $need['next_step']);

        $preview = $this->postJson('/api/v1/public/shop/checkout/steps/payment', [
            'items' => $items,
            'values' => $ship['values'],
            'preview' => true,
            'coupon_code' => 'NO-SUCH',
            'payment_gateway' => 'cod',
        ], $this->h)->assertOk()->json('data');
        $this->assertTrue($preview['preview']);
        $this->assertFalse($preview['valid']);
        $this->assertSame(150000, $preview['totals']['total_minor']);
        $this->assertNotEmpty($preview['errors']['coupon_code']);
        $this->assertArrayNotHasKey('terms_accepted', $preview['errors']);
    }

    public function test_checkout_required_fields_follow_flow_settings(): void
    {
        \App\Services\Shop\ShopSettings::saveGeneral($this->tenant->id, array_merge(\App\Services\Shop\ShopSettings::getGeneral($this->tenant->id), ['guest_checkout' => true]));
        $p = $this->product(['price_minor' => 100000]);
        $guestBody = [
            'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'shipping_instance_id' => 1,
            'shipping_state_code' => 'IR:THR',
            'shipping_city' => 'تهران',
            'address_line' => 'خیابان آزادی پلاک ۱',
        ];
        auth()->forgetGuards();
        $this->app['auth']->guard('sanctum')->forgetUser();
        $this->postJson('/api/v1/public/shop/checkout', $guestBody, $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['recipient_name', 'customer_phone']);

        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $this->putJson('/api/v1/shop/checkout-flow', ['data' => [
            'fields' => ['address' => [
                ['key' => 'recipient_name', 'enabled' => false],
                ['key' => 'customer_phone', 'enabled' => true, 'required' => false],
            ]],
        ]], $this->h)->assertOk();

        auth()->forgetGuards();
        $this->app['auth']->guard('sanctum')->forgetUser();
        $created = $this->postJson('/api/v1/public/shop/checkout', $guestBody, $this->h)->assertCreated()->json('data');
        $this->assertNull(\App\Models\Order::query()->find($created['id'])->customer_phone);
        $this->assertNull(\App\Models\Order::query()->find($created['id'])->customer_name);

        $this->user->forceFill(['name' => '', 'phone' => null])->save();
        $this->actingAs($this->user, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $this->product(['price_minor' => 80000])->id], $this->h)->assertOk();
        $order = $this->postJson('/api/v1/checkout', [
            'shipping_instance_id' => 1,
            'shipping_state_code' => 'IR:THR',
            'shipping_city' => 'تهران',
            'address_line' => 'خیابان آزادی پلاک ۱',
        ], $this->h)->assertCreated()->json('data');
        $this->assertNull($order['customer_phone'] ?? null);
    }

    public function test_checkout_gateways_include_computed_fee_amount(): void
    {
        $gateways = app(PaymentGatewaySettingsService::class);
        $gateways->setGatewayEnabled($this->tenant->id, 'zarinpal', true);
        $gateways->save($this->tenant->id, 'zarinpal', [
            'merchant_id' => 'test-merchant',
            'sandbox' => true,
            'cash_enabled' => true,
            'installment_enabled' => false,
            'fee_percent' => 2,
            'fee_payer' => 'customer',
        ]);
        $raw = $gateways->getRaw($this->tenant->id, 'zarinpal');
        $raw['fee_fixed_minor'] = 1000;
        app(\App\Services\Modules\ModuleSettingsService::class)->put($this->tenant->id, PaymentGatewaySettingsService::MODULE, 'zarinpal', $raw);

        $p = $this->product(['price_minor' => 100000]);
        $this->postJson('/api/v1/cart/items', ['product_id' => $p->id], $this->h)->assertOk();
        $this->postJson('/api/v1/checkout/steps/address', [
            'recipient_name' => 'علی', 'customer_phone' => '09121234567',
            'shipping_state_code' => 'IR:THR', 'shipping_city' => 'تهران', 'address_line' => 'خیابان یک',
        ], $this->h)->assertOk();
        $ship = $this->postJson('/api/v1/checkout/steps/shipping', ['shipping_instance_id' => 1], $this->h)->assertOk()->json('data');
        // 100000 + 50000 shipping = 150000; 2% + 1000 fixed = 4000
        $zp = collect($ship['totals']['gateways'])->firstWhere('id', 'zarinpal');
        $this->assertEquals(2, $zp['fee_percent']);
        $this->assertSame(1000, $zp['fee_fixed_minor']);
        $this->assertSame(4000, $zp['fee_amount_minor']);
        $this->assertSame('customer', $zp['fee_payer']);

        $cfg = $this->getJson('/api/v1/checkout/config', $this->h)->assertOk()->json('data');
        $fromCart = collect($cfg['gateways'])->firstWhere('id', 'zarinpal');
        $this->assertSame(4000, $fromCart['fee_amount_minor']);

        $q = $this->getJson('/api/v1/checkout/config?total_minor=200000', $this->h)->assertOk()->json('data');
        $fromQuery = collect($q['gateways'])->firstWhere('id', 'zarinpal');
        $this->assertSame(5000, $fromQuery['fee_amount_minor']); // 2% of 200000 + 1000
    }
}
