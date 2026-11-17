<?php

namespace Tests\Feature;

use App\Models\Cart;
use App\Models\Order;
use App\Models\Product;
use App\Services\Cafe\CafeGuestAuth;
use App\Services\Cafe\CafeOrdering;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Guest OTP, order history, «سفارش دوباره», 3D recordings, distance-band delivery fees,
 * kitchen service fee and the public printable menu.
 */
class CafeGuestExperienceTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'cafe-guest.test', 'slug' => 'cafe-guest']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
            'cafe.qr' => true,
            'cafe.hours' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
        $this->menu([]);
    }

    private function menu(array $overrides): void
    {
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'menu', array_merge(
            ModuleSettingsService::cafeMenuDefaults(),
            ['block_orders_when_closed' => false, 'fulfillment_delivery' => true, 'guest_otp_log_fallback' => true],
            $overrides,
        ));
    }

    private function hours(): void
    {
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'hours', [
            'timezone' => 'Asia/Tehran',
            'days' => [
                ['day' => 'monday', 'open' => '08:00', 'close' => '23:00'],
                ['day' => 'tuesday', 'open' => '08:00', 'close' => '23:00'],
                ['day' => 'wednesday', 'open' => '08:00', 'close' => '23:00'],
                ['day' => 'thursday', 'open' => '08:00', 'close' => '23:00'],
                ['day' => 'friday', 'open' => '08:00', 'close' => '23:00'],
                ['day' => 'saturday', 'open' => '08:00', 'close' => '23:00'],
                ['day' => 'sunday', 'open' => '08:00', 'close' => '23:00'],
            ],
            'closed_dates' => [],
        ]);
    }

    private function product(string $name, int $price, array $extra = []): Product
    {
        return Product::query()->create(array_merge([
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
        ], $extra));
    }

    private function add(Product $p, string $token, int $qty = 1): void
    {
        $this->postJson('/api/v1/public/cafe/cart/items', [
            'product_id' => $p->id,
            'quantity' => $qty,
            'guest_token' => $token,
        ], $this->h)->assertOk();
    }

    private function deliveryOrder(string $token, Product $p): Order
    {
        $this->add($p, $token);
        $res = $this->postJson('/api/v1/public/cafe/checkout', [
            'idempotency_key' => 'key-'.$token,
            'guest_token' => $token,
            'fulfillment' => 'delivery',
            'payment_method' => 'cash',
            'customer_name' => 'سارا محمدی',
            'customer_phone' => '09121234567',
            'address' => 'تهران، خیابان انقلاب، کوچه نرگس',
            'plaque' => '8',
            'lat' => 35.70,
            'lng' => 51.40,
        ], $this->h)->assertCreated();

        return Order::query()->findOrFail($res->json('data.id'));
    }

    // ---------------------------------------------------------------- OTP

    public function test_otp_verifies_a_guest_phone_and_returns_masked_state(): void
    {
        $token = 'guest-token-otp-1';
        $this->postJson('/api/v1/public/cafe/guest/otp', [
            'guest_token' => $token,
            'phone' => '۰۹۱۲۱۲۳۴۵۶۷',
        ], $this->h)->assertOk()->assertJsonPath('data.ok', true);

        $code = \App\Models\CafeGuestOtp::query()->where('guest_token', $token)->value('code');
        $this->assertNotNull($code);

        $this->postJson('/api/v1/public/cafe/guest/verify', [
            'guest_token' => $token,
            'phone' => '09121234567',
            'code' => $code,
        ], $this->h)->assertOk()->assertJsonPath('data.verified', true);

        $this->getJson('/api/v1/public/cafe/guest?guest_token='.$token, $this->h)
            ->assertOk()
            ->assertJsonPath('data.verified', true)
            ->assertJsonPath('data.masked', '*******4567');
    }

    public function test_wrong_otp_never_verifies_and_disappears_after_use(): void
    {
        $token = 'guest-token-otp-2';
        $this->postJson('/api/v1/public/cafe/guest/otp', ['guest_token' => $token, 'phone' => '09121234567'], $this->h)->assertOk();

        $this->postJson('/api/v1/public/cafe/guest/verify', [
            'guest_token' => $token,
            'phone' => '09121234567',
            'code' => '00000',
        ], $this->h)->assertStatus(422)->assertJsonPath('data.ok', false);

        $code = \App\Models\CafeGuestOtp::query()->where('guest_token', $token)->value('code');
        $this->postJson('/api/v1/public/cafe/guest/verify', [
            'guest_token' => $token,
            'phone' => '09121234567',
            'code' => $code,
        ], $this->h)->assertOk();

        // The code is single-use.
        $this->postJson('/api/v1/public/cafe/guest/verify', [
            'guest_token' => $token,
            'phone' => '09121234567',
            'code' => $code,
        ], $this->h)->assertStatus(422);
    }

    public function test_otp_is_required_for_delivery_when_the_cafe_turns_it_on(): void
    {
        $this->menu(['guest_otp_required' => true]);
        $p = $this->product('Latte', 100000);
        $this->add($p, 'guest-otp-required');

        $this->postJson('/api/v1/public/cafe/checkout', [
            'idempotency_key' => 'key-otp-required',
            'guest_token' => 'guest-otp-required',
            'fulfillment' => 'delivery',
            'payment_method' => 'cash',
            'customer_name' => 'سارا محمدی',
            'customer_phone' => '09121234567',
            'address' => 'تهران، خیابان انقلاب، کوچه نرگس',
            'plaque' => '8',
            'lat' => 35.70,
            'lng' => 51.40,
        ], $this->h)->assertStatus(422)->assertJsonPath('errors.customer_phone.0', __('api.cafe_otp_required'));
    }

    // ------------------------------------------------------- order history

    public function test_guest_sees_only_their_orders_and_reorders_them(): void
    {
        $p = $this->product('Latte', 100000);
        $order = $this->deliveryOrder('guest-history-1', $p);

        // Another browser sees nothing.
        $this->getJson('/api/v1/public/cafe/guest/orders?guest_token=someone-else', $this->h)
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson('/api/v1/public/cafe/guest/orders?guest_token=guest-history-1', $this->h)
            ->assertOk()
            ->assertJsonPath('data.0.id', $order->id)
            ->assertJsonPath('data.0.items.0.name', 'Latte');

        // Reorder puts the line back with today's price.
        $this->postJson('/api/v1/public/cafe/guest/orders/'.$order->id.'/reorder', [
            'guest_token' => 'guest-history-1',
        ], $this->h)->assertOk()->assertJsonPath('data.added', 1);

        $cart = Cart::query()->where('guest_token', 'guest-history-1')->firstOrFail();
        $this->assertSame(1, $cart->items()->count());
    }

    public function test_reorder_refuses_another_guests_order(): void
    {
        $p = $this->product('Latte', 100000);
        $order = $this->deliveryOrder('guest-history-2', $p);

        $this->postJson('/api/v1/public/cafe/guest/orders/'.$order->id.'/reorder', [
            'guest_token' => 'not-the-owner',
        ], $this->h)->assertForbidden();
    }

    public function test_reorder_skips_items_that_went_out_of_stock(): void
    {
        $p = $this->product('Latte', 100000);
        $order = $this->deliveryOrder('guest-history-3', $p);
        $p->update(['is_sold_out' => true]);

        $this->postJson('/api/v1/public/cafe/guest/orders/'.$order->id.'/reorder', [
            'guest_token' => 'guest-history-3',
        ], $this->h)->assertStatus(422)->assertJsonPath('data.skipped.0', 'Latte');
    }

    public function test_verified_phone_finds_orders_from_another_device(): void
    {
        $p = $this->product('Latte', 100000);
        $order = $this->deliveryOrder('phone-device-a', $p);
        $this->assertSame('09121234567', $order->customer_phone);

        // Second device proves the same phone, then sees the first device's order.
        $token = 'phone-device-b';
        $this->postJson('/api/v1/public/cafe/guest/otp', ['guest_token' => $token, 'phone' => '09121234567'], $this->h)->assertOk();
        $code = \App\Models\CafeGuestOtp::query()->where('guest_token', $token)->value('code');
        $this->postJson('/api/v1/public/cafe/guest/verify', [
            'guest_token' => $token,
            'phone' => '09121234567',
            'code' => $code,
        ], $this->h)->assertOk();

        $this->getJson('/api/v1/public/cafe/guest/orders?guest_token='.$token, $this->h)
            ->assertOk()
            ->assertJsonPath('data.0.id', $order->id)
            ->assertJsonPath('meta.verified', true);
    }

    // ----------------------------------------------------- fees and zones

    public function test_delivery_fee_follows_distance_bands(): void
    {
        $this->menu([
            'cafe_lat' => 35.7000,
            'cafe_lng' => 51.4000,
            'delivery_radius_km' => 5,
            'delivery_zones' => [
                ['min_km' => 0, 'max_km' => 2, 'fee_minor' => 150000],
                ['min_km' => 2, 'max_km' => 6, 'fee_minor' => 350000],
            ],
        ]);
        $ordering = app(CafeOrdering::class);

        $this->assertSame(150000, $ordering->zoneFee($this->tenant->id, 1.2));
        $this->assertSame(350000, $ordering->zoneFee($this->tenant->id, 4.0));
        $this->assertNull($ordering->zoneFee($this->tenant->id, 9.0));
        $this->assertSame(6.0, $ordering->zonesMaxKm($this->tenant->id));

        $quote = $this->postJson('/api/v1/public/cafe/quote', [
            'lat' => 35.7150,
            'lng' => 51.4000,
            'subtotal_minor' => 500000,
            'items' => 2,
        ], $this->h)->assertOk();

        $this->assertTrue($quote->json('data.in_zone'));
        $this->assertGreaterThan(1.0, (float) $quote->json('data.distance_km'));
    }

    public function test_quote_marks_addresses_outside_the_area(): void
    {
        $this->menu(['cafe_lat' => 35.7000, 'cafe_lng' => 51.4000, 'delivery_radius_km' => 3]);

        $this->postJson('/api/v1/public/cafe/quote', [
            'lat' => 35.8200,
            'lng' => 51.4000,
        ], $this->h)->assertOk()->assertJsonPath('data.in_zone', false);
    }

    public function test_kitchen_service_charge_applies_to_dine_in_only(): void
    {
        $this->menu(['kitchen_service_enabled' => true, 'kitchen_service_fee_minor' => 50000]);

        $dineIn = app(CafeOrdering::class)->fees($this->tenant->id, 'dine_in', 200000, 1);
        $pickup = app(CafeOrdering::class)->fees($this->tenant->id, 'pickup', 200000, 1);

        $this->assertSame(50000, $dineIn['service_minor']);
        $this->assertSame(0, $pickup['service_minor']);
    }

    public function test_today_window_and_next_opening_come_from_the_hours(): void
    {
        $this->hours();
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-05-04 23:30:00', 'Asia/Tehran')); // Monday night

        $status = app(CafeOrdering::class)->publicStatus($this->tenant->id);
        $this->assertFalse($status['is_open']);
        $this->assertSame('08:00', $status['today']['today_open']);
        $this->assertNotNull($status['next_open']);
        $this->assertSame('08:00', $status['next_open']['at']);

        \Carbon\Carbon::setTestNow();
    }

    // ------------------------------------------------------- item features

    public function test_addons_ride_along_with_an_order_line(): void
    {
        $p = $this->product('Latte', 100000);

        $this->postJson('/api/v1/public/cafe/cart/items', [
            'product_id' => $p->id,
            'guest_token' => 'guest-addons',
            'addons' => ['شیر بادام', 'بدون شکر'],
        ], $this->h)->assertOk();

        $cart = Cart::query()->where('guest_token', 'guest-addons')->firstOrFail();
        $meta = $cart->items()->firstOrFail()->meta;
        $this->assertCount(2, $meta['addons']);
        $this->assertSame('شیر بادام', $meta['addons'][0]['name_fa']);
        $this->assertSame(0, $meta['addons'][0]['price_minor']);
        // An add-on never changes the unit price.
        $this->assertSame(100000, $meta['unit_minor']);
    }

    public function test_addon_outside_the_catalog_is_ignored_for_pricing(): void
    {
        $p = $this->product('Latte', 100000);
        $priced = app(CafeOrdering::class)->priceLine($p, [], null);

        $this->assertSame(100000, $priced['unit_minor']);
        $this->assertSame([], app(CafeOrdering::class)->addonSelections($p, ['']));
    }

    public function test_three_d_recordings_are_saved_and_served_publicly(): void
    {
        $p = $this->product('Latte', 100000);
        $admin = \App\Models\User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/v1/products/'.$p->id.'/gallery-views', [
                'views' => [
                    ['type' => 'model3d', 'url' => '/models/latte.glb'],
                    ['type' => 'spin360', 'url' => '/spin/latte', 'frames' => 24],
                ],
            ], $this->h)
            ->assertOk()
            ->assertJsonCount(2, 'data.gallery_views');

        $this->getJson('/api/v1/public/catalog/items/'.$p->slug, $this->h)
            ->assertOk()
            ->assertJsonPath('data.gallery_views.0.type', 'model3d')
            ->assertJsonPath('data.gallery_views.1.frames', 24);
    }

    public function test_service_label_is_saved_on_a_product(): void
    {
        $p = $this->product('Tea', 50000, [
            'has_service' => true,
            'service_label_fa' => 'سرو در قوری',
        ]);

        $this->getJson('/api/v1/public/catalog/items/'.$p->slug, $this->h)
            ->assertOk()
            ->assertJsonPath('data.has_service', true)
            ->assertJsonPath('data.service_label_fa', 'سرو در قوری');
    }

    // ------------------------------------------------------------- menu PDF

    public function test_public_menu_pdf_is_printable_without_a_session(): void
    {
        $this->product('Latte', 100000);
        $this->product('Cold Brew', 120000);

        $res = $this->get('/api/v1/public/cafe/menu-pdf', $this->h);
        $res->assertOk();
        $this->assertStringContainsString('Latte', $res->getContent());
        $this->assertStringContainsString('Cold Brew', $res->getContent());
    }

    public function test_guest_auth_normalises_phone_shapes(): void
    {
        $this->assertSame('09121234567', CafeGuestAuth::normalizePhone('+989121234567'));
        $this->assertSame('09121234567', CafeGuestAuth::normalizePhone('۰۹۱۲۱۲۳۴۵۶۷'));
        $this->assertSame('09121234567', CafeGuestAuth::normalizePhone('00989121234567'));
        $this->assertTrue(CafeGuestAuth::phoneIsValid('09121234567'));
        $this->assertFalse(CafeGuestAuth::phoneIsValid('12345'));
    }
}
