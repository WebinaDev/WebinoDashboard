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
}
