<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Product;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shop\ShopSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CafeCheckoutPaymentVatTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'cafe-pay.test', 'slug' => 'cafe-pay']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
        $this->menu([]);
    }

    private function menu(array $overrides): void
    {
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'menu', array_merge(
            ModuleSettingsService::cafeMenuDefaults(),
            ['block_orders_when_closed' => false, 'fulfillment_delivery' => true],
            $overrides,
        ));
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
        $this->postJson('/api/v1/public/cafe/cart/items', ['product_id' => $p->id, 'quantity' => $qty, 'guest_token' => $token], $this->h)->assertOk();
    }

    private function delivery(string $token, array $extra = []): array
    {
        return array_merge([
            'idempotency_key' => 'key-'.$token,
            'guest_token' => $token,
            'fulfillment' => 'delivery',
            'payment_method' => 'cash',
            'customer_name' => 'سارا محمدی',
            'customer_phone' => '09121234567',
            'address' => 'تهران، خیابان انقلاب، کوچه نرگس',
            'plaque' => '8',
            'unit' => '2',
            'lat' => 35.70,
            'lng' => 51.40,
        ], $extra);
    }

    public function test_delivery_requires_complete_valid_data(): void
    {
        $p = $this->product('Latte', 100000);
        $this->add($p, 'tok-delivery-1');

        $this->postJson('/api/v1/public/cafe/checkout', $this->delivery('tok-delivery-1', ['customer_phone' => '0212345678']), $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['customer_phone']);
        $this->postJson('/api/v1/public/cafe/checkout', $this->delivery('tok-delivery-1', ['lat' => null, 'lng' => null]), $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['lat']);
        $this->postJson('/api/v1/public/cafe/checkout', $this->delivery('tok-delivery-1', ['postal_code' => '123']), $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['postal_code']);
        $this->postJson('/api/v1/public/cafe/checkout', $this->delivery('tok-delivery-1', ['address' => null]), $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['address']);

        $order = $this->postJson('/api/v1/public/cafe/checkout', $this->delivery('tok-delivery-1'), $this->h)->assertCreated()->json('data');
        $row = Order::query()->findOrFail($order['id']);
        $this->assertSame('processing', $row->status);
        $this->assertSame('09121234567', $row->customer_phone);
        $this->assertSame(35.7, $row->meta['delivery']['lat']);
    }

    public function test_checkout_is_idempotent_and_ignores_client_prices(): void
    {
        $p = $this->product('Mocha', 120000);
        $this->add($p, 'tok-idem-1', 2);
        $payload = $this->delivery('tok-idem-1', ['total_minor' => 1, 'subtotal_minor' => 1]);

        $first = $this->postJson('/api/v1/public/cafe/checkout', $payload, $this->h)->assertCreated()->json('data');
        $second = $this->postJson('/api/v1/public/cafe/checkout', $payload, $this->h)->assertOk()->json('data');

        $this->assertSame($first['id'], $second['id']);
        $this->assertSame(1, Order::query()->where('tenant_id', $this->tenant->id)->count());
        $this->assertSame(240000, (int) $first['subtotal_minor']);
    }

    public function test_delivery_zone_is_enforced(): void
    {
        $this->menu(['delivery_radius_km' => 3, 'cafe_lat' => 35.70, 'cafe_lng' => 51.40]);
        $p = $this->product('Tea', 50000);
        $this->add($p, 'tok-zone-1');

        $this->postJson('/api/v1/public/cafe/checkout', $this->delivery('tok-zone-1', ['lat' => 35.80, 'lng' => 51.60]), $this->h)
            ->assertStatus(422)->assertJsonPath('message', __('api.cafe_out_of_zone'));
        $this->postJson('/api/v1/public/cafe/checkout', $this->delivery('tok-zone-1', ['lat' => 35.71, 'lng' => 51.41]), $this->h)
            ->assertCreated();
    }

    public function test_unconfigured_gateway_cannot_be_chosen_and_cash_can_be_disabled(): void
    {
        $p = $this->product('Cake', 90000);
        $this->add($p, 'tok-gw-1');

        $methods = $this->getJson('/api/v1/public/cafe/venue', $this->h)->assertOk()->json('data.ordering.payment_methods');
        $this->assertSame(['cash'], array_column($methods, 'id'));

        $this->postJson('/api/v1/public/cafe/checkout', $this->delivery('tok-gw-1', ['payment_method' => 'zarinpal']), $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['payment_method']);

        $this->menu(['pay_cash_enabled' => false]);
        $this->postJson('/api/v1/public/cafe/checkout', $this->delivery('tok-gw-1'), $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['payment_method']);
    }

    public function test_pending_online_order_returns_to_cafe_menu_after_failed_callback_and_stays_off_kitchen(): void
    {
        $p = $this->product('Espresso', 80000);
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'awaiting_gateway',
            'subtotal_minor' => 80000,
            'total_minor' => 80000,
            'currency' => 'IRR',
            'meta' => ['source' => 'guest_table', 'return_url' => 'https://cafe-pay.test/catalogue', 'kitchen_status' => 'new'],
        ]);
        PaymentIntent::query()->create([
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->id,
            'provider' => 'zarinpal',
            'status' => 'created',
            'meta' => ['zarinpal_authority' => 'AUTH-CAFE', 'amount_rial' => 80000],
        ]);

        $admin = \App\Models\User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $ids = collect($this->getJson('/api/v1/cafe/kitchen-orders')->json('data'))->pluck('id')->all();
        $this->assertNotContains($order->id, $ids);

        $res = $this->get('/api/v1/payments/callback/zarinpal/'.$order->id.'?Authority=AUTH-CAFE&Status=NOK');
        $res->assertRedirect('https://cafe-pay.test/catalogue?order='.$order->id.'&payment=failed');
        $this->assertSame('payment_failed', $order->fresh()->status);
    }

    public function test_vat_applies_per_item_and_category_flags(): void
    {
        ShopSettings::saveTax($this->tenant->id, ['enabled' => true, 'rate_percent' => 10, 'prices_include_tax' => false, 'show_on_invoice' => true]);
        $exemptCat = \App\Models\Category::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'Bread', 'slug' => 'bread', 'vat_applicable' => false]);
        $coffee = $this->product('Coffee', 100000);
        $bread = $this->product('Bread', 50000, ['category_id' => $exemptCat->id]);
        $water = $this->product('Water', 20000, ['vat_applicable' => false]);
        $token = 'tok-vat-1';
        $this->add($coffee, $token);
        $this->add($bread, $token);
        $this->add($water, $token);

        $totals = $this->getJson('/api/v1/public/cafe/cart?guest_token='.$token.'&fulfillment=dine_in', $this->h)->assertOk()->json('data.totals');
        $this->assertSame(10000, $totals['tax_minor']);
        $this->assertTrue($totals['show_vat']);
        $this->assertSame(170000 + 10000, $totals['grand_total_minor']);

        $order = $this->postJson('/api/v1/public/cafe/checkout', [
            'guest_token' => $token, 'fulfillment' => 'dine_in', 'table_number' => '5', 'payment_method' => 'cash', 'idempotency_key' => 'vat-key-123',
        ], $this->h)->assertCreated()->json('data');
        $this->assertSame(10000, (int) $order['tax_minor']);
        $this->assertSame(180000, (int) $order['total_minor']);
        $this->assertSame(10.0, (float) $order['vat']['rate']);

        // Inclusive prices: VAT is extracted, total unchanged.
        ShopSettings::saveTax($this->tenant->id, ['enabled' => true, 'rate_percent' => 10, 'prices_include_tax' => true]);
        $this->add($coffee, 'tok-vat-2');
        $inc = $this->getJson('/api/v1/public/cafe/cart?guest_token=tok-vat-2', $this->h)->json('data.totals');
        $this->assertSame(9091, $inc['tax_minor']);
        $this->assertSame(100000, $inc['grand_total_minor']);
    }

    private function hours(array $days, array $closed = []): void
    {
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'hours', [
            'timezone' => 'Asia/Tehran', 'days' => $days, 'closed_dates' => $closed,
        ]);
    }

    public function test_pickup_slots_follow_hours_prep_and_holidays(): void
    {
        $this->menu(['prep_minutes' => 20, 'pickup_slot_minutes' => 30]);
        // Tuesday 2026-10-13 21:50 Tehran; open 08:00-23:00 every day.
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-10-13 21:50', 'Asia/Tehran'));
        $all = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        $this->hours(array_map(fn ($d) => ['day' => $d, 'open' => '08:00', 'close' => '23:00'], $all));

        $times = array_column($this->getJson('/api/v1/public/cafe/pickup-slots', $this->h)->assertOk()->json('data'), 'time');
        // 21:50 + 20 = 22:10, rounded to 22:30; 23:00 is closing (half-open); next day from 08:00.
        $this->assertSame('22:30', $times[0]);
        $this->assertNotContains('23:00', $times);
        $this->assertNotContains('02:00', $times);
        $this->assertContains('08:00', $times);

        // Overnight: Tuesday 18:00-02:00 keeps slots after midnight.
        $this->hours([['day' => 'tuesday', 'open' => '18:00', 'close' => '02:00'], ['day' => 'wednesday', 'closed' => true]]);
        $times = array_column($this->getJson('/api/v1/public/cafe/pickup-slots', $this->h)->json('data'), 'time');
        $this->assertContains('01:30', $times);
        $this->assertNotContains('02:00', $times);
        $this->assertNotContains('10:00', $times);

        // Holiday tomorrow: only tonight's slots before 23:00.
        $this->hours(array_map(fn ($d) => ['day' => $d, 'open' => '08:00', 'close' => '23:00'], $all), ['2026-10-14']);
        $times = array_column($this->getJson('/api/v1/public/cafe/pickup-slots', $this->h)->json('data'), 'time');
        $this->assertSame(['22:30'], $times);

        // Server rejects an unoffered time and accepts an offered one.
        $p = $this->product('Latte', 100000);
        $this->add($p, 'tok-pickup-1');
        $base = ['guest_token' => 'tok-pickup-1', 'fulfillment' => 'pickup', 'payment_method' => 'cash',
            'customer_name' => 'رضا', 'customer_phone' => '09121234567'];
        $this->postJson('/api/v1/public/cafe/checkout', $base + ['pickup_time' => '22:00', 'idempotency_key' => 'pk-1-aaaa'], $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['pickup_time']);
        $this->postJson('/api/v1/public/cafe/checkout', $base + ['pickup_time' => '09:00', 'idempotency_key' => 'pk-2-aaaa'], $this->h)
            ->assertStatus(422);
        $order = $this->postJson('/api/v1/public/cafe/checkout', $base + ['pickup_time' => '22:30', 'idempotency_key' => 'pk-3-aaaa'], $this->h)
            ->assertCreated()->json('data');
        $this->assertStringStartsWith('2026-10-13T22:30', Order::query()->find($order['id'])->meta['pickup_at']);
        \Carbon\Carbon::setTestNow();
    }

    public function test_vat_line_hidden_when_show_on_invoice_is_off(): void
    {
        ShopSettings::saveTax($this->tenant->id, ['enabled' => true, 'rate_percent' => 10, 'prices_include_tax' => false, 'show_on_invoice' => false]);
        $coffee = $this->product('Coffee', 100000);
        $this->add($coffee, 'tok-hide-vat');
        $totals = $this->getJson('/api/v1/public/cafe/cart?guest_token=tok-hide-vat&fulfillment=dine_in', $this->h)->assertOk()->json('data.totals');
        $this->assertFalse($totals['show_vat']);
        $this->assertSame(10000, $totals['tax_minor']);

        $order = $this->postJson('/api/v1/public/cafe/checkout', [
            'guest_token' => 'tok-hide-vat', 'fulfillment' => 'dine_in', 'table_number' => '2', 'payment_method' => 'cash', 'idempotency_key' => 'hide-vat-key-1',
        ], $this->h)->assertCreated()->json('data');

        $admin = \App\Models\User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $this->getJson('/api/v1/orders/'.$order['id'])->assertOk()->assertJsonPath('data.show_vat', false);

        ShopSettings::saveTax($this->tenant->id, ['enabled' => true, 'rate_percent' => 10, 'show_on_invoice' => true]);
        $this->getJson('/api/v1/orders/'.$order['id'])->assertOk()->assertJsonPath('data.show_vat', true);
    }

    public function test_kitchen_done_completes_cash_order(): void
    {
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id, 'status' => 'processing', 'subtotal_minor' => 1000, 'total_minor' => 1000,
            'currency' => 'IRR', 'meta' => ['source' => 'guest_table', 'kitchen_status' => 'ready'],
        ]);
        $admin = \App\Models\User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $this->patchJson('/api/v1/cafe/kitchen-orders/'.$order->id, ['kitchen_status' => 'done'])->assertOk();
        $this->assertSame('completed', $order->fresh()->status);
    }

    public function test_settings_changes_show_on_public_endpoints_immediately(): void
    {
        $first = $this->getJson('/api/v1/public/cafe/venue', $this->h)->assertOk();
        $this->assertStringContainsString('no-cache', (string) $first->headers->get('Cache-Control'));
        $this->assertStringNotContainsString('max-age=60', (string) $first->headers->get('Cache-Control'));

        $this->menu(['show_search' => false, 'packaging_fee_minor' => 7000]);
        ShopSettings::saveTax($this->tenant->id, ['enabled' => true, 'rate_percent' => 9, 'show_on_invoice' => false]);
        $venue = $this->getJson('/api/v1/public/cafe/venue', $this->h)->assertOk()->json('data');
        $this->assertFalse((bool) $venue['menu']['show_search']);
        $this->assertSame(7000, (int) $venue['menu']['packaging_fee_minor']);

        // A write that bypasses the service still drops the cached copy.
        \App\Models\ModuleSetting::query()->where('tenant_id', $this->tenant->id)->where('module_slug', 'cafe')->where('submodule_slug', 'menu')
            ->firstOrFail()->update(['payload' => array_merge(ModuleSettingsService::cafeMenuDefaults(), ['show_search' => true])]);
        $this->assertTrue((bool) $this->getJson('/api/v1/public/cafe/venue', $this->h)->json('data.menu.show_search'));

        $catalog = $this->getJson('/api/v1/public/catalog', $this->h)->assertOk();
        $this->assertStringContainsString('no-cache', (string) $catalog->headers->get('Cache-Control'));
    }

    public function test_table_qr_carries_id_and_checkout_rejects_unknown_or_deleted_tables(): void
    {
        $branch = \App\Models\CafeBranch::query()->create(['tenant_id' => $this->tenant->id, 'name_fa' => 'مرکزی', 'slug' => 'center']);
        $t5 = \App\Models\CafeTable::query()->create(['tenant_id' => $this->tenant->id, 'branch_id' => $branch->id, 'code' => '5', 'seats' => 4, 'is_active' => true]);
        $off = \App\Models\CafeTable::query()->create(['tenant_id' => $this->tenant->id, 'code' => '9', 'seats' => 2, 'is_active' => false]);

        $admin = \App\Models\User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $qr = $this->getJson('/api/v1/cafe/qr?table_id='.$t5->id)->assertOk();
        $url = $qr->json('data.url');
        // QR images are drawn in the dashboard; no third-party QR service is referenced.
        $this->assertArrayNotHasKey('qr_svg', $qr->json('data'));
        $this->assertStringNotContainsString('qrserver', $qr->getContent());
        $this->assertStringContainsString('table=5', $url);
        $this->assertStringContainsString('table_id='.$t5->id, $url);
        $this->assertStringContainsString('branch=center', $url);

        $this->getJson('/api/v1/public/cafe/table?table_id='.$t5->id, $this->h)->assertOk()->assertJsonPath('data.code', '5')->assertJsonPath('data.branch_slug', 'center');
        $this->getJson('/api/v1/public/cafe/table?table=9', $this->h)->assertNotFound();
        $this->getJson('/api/v1/public/cafe/table?table=77', $this->h)->assertNotFound();

        $p = $this->product('Tea', 30000);
        $this->add($p, 'tok-tbl');
        $base = ['guest_token' => 'tok-tbl', 'fulfillment' => 'dine_in', 'payment_method' => 'cash'];
        $this->postJson('/api/v1/public/cafe/checkout', $base + ['table_number' => '77', 'idempotency_key' => 'tbl-key-1'], $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['table_number']);
        $this->postJson('/api/v1/public/cafe/checkout', $base + ['table_number' => (string) $off->code, 'idempotency_key' => 'tbl-key-2'], $this->h)
            ->assertStatus(422);
        $order = $this->postJson('/api/v1/public/cafe/checkout', $base + ['table_number' => '5', 'idempotency_key' => 'tbl-key-3'], $this->h)
            ->assertCreated()->json('data');
        $this->assertSame('5', (string) $order['table_number']);

        // A table deleted after its QR was printed no longer validates.
        $t5->delete();
        $this->getJson('/api/v1/public/cafe/table?table_id='.$t5->id, $this->h)->assertNotFound();
    }
}
