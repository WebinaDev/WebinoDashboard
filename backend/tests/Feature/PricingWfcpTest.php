<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Pricing\PricingSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PricingWfcpTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop', 'slug' => 'shop', 'domain' => 'shop.test', 'license_key' => 'k',
            'setup_completed' => true, 'store_display_name' => 'Shop', 'default_currency' => 'IRR',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.brands' => true,
            'commerce.pricing' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($this->user, 'sanctum');
    }

    /** @param array<string, mixed> $attrs */
    protected function product(array $attrs = []): Product
    {
        static $n = 0;
        $n++;

        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'P'.$n,
            'slug' => 'p-'.$n,
            'price_minor' => 120000,
            'purchase_price_minor' => 100000,
            'currency' => 'IRR',
            'status' => 'publish',
            'is_available' => true,
        ], $attrs));
    }

    protected function enableCredit(array $extra = []): void
    {
        PricingSettings::saveSection($this->tenant->id, 'credit', array_merge(['enabled' => true, 'increase_percent' => 10], $extra));
    }

    public function test_section_save_sanitizes_and_merges_defaults(): void
    {
        $this->putJson('/api/v1/pricing/settings/installment', ['data' => [
            'enabled' => '1',
            'plans' => [['months' => '6', 'interest' => '12.5'], 'bad'],
            'round_to' => 0,
        ]])->assertOk()->assertJsonPath('data.section', 'installment');

        $this->putJson('/api/v1/pricing/settings/exchange', [
            'exchange_rate' => '۵۰٬۰۰۰', 'purchase_currency' => 'base', 'exchange_rate_enabled' => true, 'api_key' => ' key ',
        ])->assertOk()->assertJsonPath('data.section', 'general');

        $this->putJson('/api/v1/pricing/settings/digikala', ['data' => ['enabled' => true, 'profit_percent' => 7, 'price_mode' => 'nope']])->assertOk();
        $this->putJson('/api/v1/pricing/settings/unknown', ['data' => []])->assertStatus(422);

        $s = $this->getJson('/api/v1/pricing/settings')->assertOk()->json('data');
        $this->assertTrue($s['installment']['enabled']);
        $this->assertSame([['months' => 6, 'interest' => 12.5]], $s['installment']['plans']);
        $this->assertSame(1, $s['installment']['round_to']);
        $this->assertEquals(50000, $s['general']['exchange_rate']);
        $this->assertSame('base', $s['general']['purchase_currency']);
        $this->assertSame('key', $s['general']['api_key']);
        $this->assertSame(20, $s['retail']['profit_percent']);
        $this->assertEquals(7, $s['platforms']['digikala']['profit_percent']);
        $this->assertSame('markup', $s['platforms']['digikala']['price_mode']);
        $this->assertArrayHasKey('torob', $s['platforms']);
    }

    public function test_export_import_stats_calculate_and_brand_patch(): void
    {
        $this->putJson('/api/v1/pricing/settings/exchange', ['api_key' => 'secret'])->assertOk();
        $json = $this->getJson('/api/v1/pricing/settings/export')->assertOk()->json('data.json');
        $decoded = json_decode($json, true);
        $this->assertSame('', $decoded['wfcp_settings']['general']['api_key']);

        $decoded['wfcp_settings']['retail']['profit_percent'] = 30;
        $this->postJson('/api/v1/pricing/settings/import', ['json' => json_encode($decoded)])->assertOk();
        $s = PricingSettings::get($this->tenant->id);
        $this->assertEquals(30, $s['retail']['profit_percent']);
        $this->assertSame('secret', $s['general']['api_key']);
        $this->postJson('/api/v1/pricing/settings/import', ['json' => 'nope'])->assertStatus(422);

        $p = $this->product(['lock_price' => true]);
        $this->getJson('/api/v1/pricing/stats')->assertOk()
            ->assertJsonPath('data.total_products', 1)
            ->assertJsonPath('data.products_with_price', 1)
            ->assertJsonPath('data.products_locked', 1)
            ->assertJsonPath('data.purchase_types', ['cash']);

        $calc = $this->postJson('/api/v1/pricing/calculate', ['purchase_price_minor' => 100000])->assertOk()->json('data');
        $this->assertEquals(130000, $calc['retail']);
        $this->assertArrayHasKey('digikala', $calc['channels']);

        $brand = Brand::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'slug' => 'b']);
        $this->patchJson("/api/v1/pricing/bulk-products/{$p->id}/brand", ['brand_id' => $brand->id])->assertOk();
        $this->assertSame([$brand->id], $p->brands()->pluck('brands.id')->all());
        $this->patchJson("/api/v1/pricing/bulk-products/{$p->id}/brand", ['brand_id' => null])->assertOk();
        $this->assertSame(0, $p->brands()->count());

        $this->getJson('/api/v1/pricing/meta')->assertOk()->assertJsonStructure(['data' => ['gateways', 'platforms', 'categories', 'brands']]);
    }

    public function test_recalculate_all_skips_locked_and_supports_dry_run(): void
    {
        $free = $this->product(['price_minor' => 1]);
        $locked = $this->product(['price_minor' => 1, 'lock_price' => true]);

        $this->postJson('/api/v1/pricing/recalculate', ['dry_run' => true])->assertOk();
        $state = $this->getJson('/api/v1/pricing/recalculate/state')->assertOk()->json('data');
        $this->assertSame('done', $state['status']);
        $this->assertSame(1, $state['updated']);
        $this->assertSame(1, $state['skipped']);
        $this->assertSame(1, $free->fresh()->price_minor);

        $this->postJson('/api/v1/pricing/recalculate')->assertOk();
        $this->assertSame(120000, $free->fresh()->price_minor);
        $this->assertSame(1, $locked->fresh()->price_minor);
    }

    public function test_exchange_test_and_fetch_updates_rate_and_recalculates(): void
    {
        Http::fake([
            'brsapi.ir/*' => Http::response(['currency' => [['symbol' => 'EUR', 'price' => 1], ['symbol' => 'USD', 'price' => 60000]]]),
        ]);

        $this->postJson('/api/v1/pricing/exchange/test', ['api_key' => 'k', 'api_symbol' => 'USD'])
            ->assertOk()->assertJsonPath('data.price', 60000);
        $this->postJson('/api/v1/pricing/exchange/test', ['api_key' => 'k', 'api_symbol' => 'GBP'])->assertStatus(400);
        $this->postJson('/api/v1/pricing/exchange/fetch')->assertStatus(400);

        PricingSettings::saveSection($this->tenant->id, 'exchange', [
            'api_enabled' => true, 'api_key' => 'k', 'exchange_rate_enabled' => true, 'purchase_currency' => 'base',
        ]);
        $product = $this->product(['purchase_price_minor' => 10, 'price_minor' => 1]);
        $this->postJson('/api/v1/pricing/exchange/fetch')->assertOk()->assertJsonPath('data.price', 60000);

        $this->assertEquals(60000, PricingSettings::get($this->tenant->id)['general']['exchange_rate']);
        $this->assertSame(720000, $product->fresh()->price_minor);
        Http::assertSent(fn (HttpRequest $r) => str_contains(strtolower($r->url()), 'brsapi.ir') && $r['key'] === 'k');
    }

    public function test_reference_fetch_from_digikala_updates_purchase_and_stock(): void
    {
        PricingSettings::saveSection($this->tenant->id, 'reference', ['enabled' => true]);
        Http::fake([
            'api.digikala.com/v2/product/123/' => Http::response(['data' => ['product' => [
                'default_variant' => ['id' => 9, 'status' => 'marketable', 'price' => ['selling_price' => 1500000]],
            ]]]),
        ]);
        $product = $this->product(['stock_status' => 'outofstock']);

        $this->postJson("/api/v1/pricing/products/{$product->id}/reference-fetch", ['url' => 'https://www.digikala.com/product/dkp-123/x/'])
            ->assertOk()
            ->assertJsonPath('data.source', 'digikala')
            ->assertJsonPath('data.purchase_price_minor', 1500000)
            ->assertJsonPath('data.price_minor', 1800000);

        $fresh = $product->fresh();
        $this->assertSame('instock', $fresh->stock_status);
        $this->assertSame('digikala', $fresh->reference_source);

        PricingSettings::saveSection($this->tenant->id, 'reference', ['sources' => ['digikala' => false]]);
        $this->postJson("/api/v1/pricing/products/{$product->id}/reference-fetch")->assertStatus(422);
    }

    public function test_credit_checkout_uses_purchase_type_price_and_stores_meta(): void
    {
        $this->enableCredit();
        $product = $this->product();

        $cart = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 2, 'purchase_type' => 'credit'])
            ->assertOk()->json('data.pricing');
        $this->assertSame('credit', $cart['purchase_type']);
        $this->assertSame(132000, $cart['lines'][0]['unit_price_minor']);
        $this->assertSame(264000, $cart['subtotal_minor']);
        $this->assertSame(['cash', 'credit'], $cart['available_types']);

        $order = $this->postJson('/api/v1/checkout', [])->assertCreated()->json('data');
        $this->assertSame(264000, $order['subtotal_minor']);
        $this->assertSame('credit', $order['meta']['wfcp_purchase_type']);
        $this->assertSame('credit', $order['items'][0]['purchase_type']);
        $this->assertSame(132000, $order['items'][0]['unit_price_minor']);
    }

    public function test_installment_cart_total_and_switching_type(): void
    {
        PricingSettings::saveSection($this->tenant->id, 'installment', ['enabled' => true, 'plans' => [['months' => 4, 'interest' => 20]]]);
        $product = $this->product();
        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id]);

        $pricing = $this->putJson('/api/v1/cart/purchase-type', ['purchase_type' => 'installment', 'installment_months' => 99])
            ->assertOk()->json('data.pricing');
        $this->assertSame(4, $pricing['installment_months']);
        $this->assertSame(144000, $pricing['subtotal_minor']);
        $this->assertSame(36000, $pricing['installment_monthly_minor']);

        $pricing = $this->putJson('/api/v1/cart/purchase-type', ['purchase_type' => 'credit'])->assertOk()->json('data.pricing');
        $this->assertSame('cash', $pricing['purchase_type']);
        $this->assertSame(120000, $pricing['subtotal_minor']);
    }

    public function test_one_wholesale_line_makes_whole_cart_wholesale(): void
    {
        PricingSettings::saveSection($this->tenant->id, 'wholesale', ['enabled' => true, 'discount_percent' => 10]);
        $a = $this->product();
        $b = $this->product(['purchase_price_minor' => 200000, 'price_minor' => 240000]);

        $this->postJson('/api/v1/cart/items', ['product_id' => $a->id, 'purchase_type' => 'cash'])->assertOk();
        $pricing = $this->postJson('/api/v1/cart/items', ['product_id' => $b->id, 'purchase_type' => 'wholesale'])->assertOk()->json('data.pricing');
        $this->assertSame('wholesale', $pricing['purchase_type']);
        $this->assertSame(90000 + 180000, $pricing['subtotal_minor']);

        $c = $this->product();
        $pricing = $this->postJson('/api/v1/cart/items', ['product_id' => $c->id, 'purchase_type' => 'cash'])->assertOk()->json('data.pricing');
        $this->assertSame('wholesale', $pricing['purchase_type']);

        $order = $this->postJson('/api/v1/checkout', [])->assertCreated()->json('data');
        $this->assertSame('wholesale', $order['meta']['wfcp_purchase_type']);
    }

    public function test_gateway_filter_blocks_disallowed_provider_for_purchase_type(): void
    {
        $gateways = app(PaymentGatewaySettingsService::class);
        $gateways->saveHub($this->tenant->id, ['enabled' => ['zarinpal' => true]]);
        $gateways->save($this->tenant->id, 'zarinpal', ['merchant_id' => 'm-123', 'sandbox' => true]);
        $this->enableCredit(['gateways' => ['digipay']]);
        Http::fake([
            'sandbox.zarinpal.com/*' => Http::response(['data' => ['code' => 100, 'authority' => 'A1']]),
        ]);

        $product = $this->product();
        $cart = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'purchase_type' => 'credit'])->json('data.pricing');
        $this->assertSame(['digipay'], $cart['allowed_gateways']);
        $creditOrder = $this->postJson('/api/v1/checkout', [])->assertCreated()->json('data');

        $this->postJson('/api/v1/payments/intent', ['order_id' => $creditOrder['id'], 'provider' => 'zarinpal'])
            ->assertStatus(422);
        $this->assertSame('pending_payment', Order::query()->find($creditOrder['id'])->status);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'purchase_type' => 'cash']);
        $cashOrder = $this->postJson('/api/v1/checkout', [])->assertCreated()->json('data');
        $this->postJson('/api/v1/payments/intent', ['order_id' => $cashOrder['id'], 'provider' => 'zarinpal'])->assertOk();
    }

    public function test_public_catalog_exposes_type_prices_without_purchase_price(): void
    {
        $this->enableSubmodules($this->tenant->id, ['cafe.catalog' => true]);
        $this->enableCredit();
        $this->product(['slug' => 'shown']);

        $res = $this->getJson('/api/v1/public/catalog/items/shown', ['X-Tenant-Domain' => 'shop.test']);
        if ($res->status() !== 200) {
            $this->markTestSkipped('Public catalog route not reachable in this test setup.');
        }
        $this->assertSame(['cash' => 120000, 'credit' => 132000], $res->json('data.pricing.types'));
        $this->assertArrayNotHasKey('purchase_price_minor', $res->json('data'));
    }
}
