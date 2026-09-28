<?php

namespace Tests\Feature;

use App\Models\Cart;
use App\Models\CartItem;
use App\Models\DashboardModule;
use App\Models\Order;
use App\Models\Product;
use App\Models\TenantModule;
use App\Models\User;
use App\Services\Shop\ShopSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CheckoutTaxTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $tenant = $this->createTenant(['domain' => 'localhost']);
        foreach (['dashboard', 'catalog', 'cart', 'checkout'] as $slug) {
            DashboardModule::query()->firstOrCreate(['slug' => $slug], [
                'requires_license' => false,
                'git_repo' => null,
                'default_version' => '0.1.0',
            ]);
            TenantModule::query()->create([
                'tenant_id' => $tenant->id,
                'module_slug' => $slug,
                'enabled' => true,
                'licensed' => true,
                'installed_version' => '0.1.0',
            ]);
        }
        $this->enableSubmodules($tenant->id, [
            'core.dashboard' => true,
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
    }

    private function checkout(int $priceMinor, array $payload = []): array
    {
        $tid = (int) $this->user->tenant_id;
        $product = Product::query()->create([
            'tenant_id' => $tid,
            'name' => 'P',
            'sku' => 's-'.uniqid(),
            'price_minor' => $priceMinor,
            'currency' => 'IRR',
            'stock' => 5,
        ]);
        $cart = Cart::query()->firstOrCreate(['tenant_id' => $tid, 'user_id' => $this->user->id]);
        CartItem::query()->create(['cart_id' => $cart->id, 'product_id' => $product->id, 'quantity' => 1]);

        return $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/checkout', array_merge(['shipping_address' => 'Tehran'], $payload))
            ->assertCreated()
            ->json('data');
    }

    public function test_no_tax_when_tax_never_configured(): void
    {
        $data = $this->checkout(100000);

        $this->assertSame(0, (int) $data['tax_minor']);
        $this->assertSame(100000, (int) $data['total_minor']);
        $this->assertArrayNotHasKey('tax_lines', $data['meta'] ?? []);
    }

    public function test_no_tax_when_disabled_or_zero_rate(): void
    {
        ShopSettings::saveTax((int) $this->user->tenant_id, ['enabled' => false, 'rate_percent' => 10]);
        $this->assertSame(100000, (int) $this->checkout(100000)['total_minor']);

        ShopSettings::saveTax((int) $this->user->tenant_id, ['enabled' => true, 'rate_percent' => 0]);
        $data = $this->checkout(100000);
        $this->assertSame(0, (int) $data['tax_minor']);
        $this->assertSame(100000, (int) $data['total_minor']);
    }

    public function test_exclusive_tax_is_added_to_total(): void
    {
        ShopSettings::saveTax((int) $this->user->tenant_id, ['enabled' => true, 'rate_percent' => 10, 'prices_include_tax' => false]);

        $data = $this->checkout(100000);

        $this->assertSame(10000, (int) $data['tax_minor']);
        $this->assertSame(110000, (int) $data['total_minor']);
        $order = Order::query()->findOrFail($data['id']);
        $this->assertSame(10000, (int) $order->tax_minor);
        $this->assertSame(10000, (int) $order->meta['tax_lines'][0]['order_tax']);
        $this->assertSame(0, (int) $order->meta['tax_lines'][0]['shipping_tax']);
        $this->assertEquals(10, $order->meta['tax_lines'][0]['rate']);
    }

    public function test_inclusive_tax_is_extracted_not_added(): void
    {
        ShopSettings::saveTax((int) $this->user->tenant_id, ['enabled' => true, 'rate_percent' => 10, 'prices_include_tax' => true]);

        $data = $this->checkout(110000);

        $this->assertSame(10000, (int) $data['tax_minor']);
        $this->assertSame(110000, (int) $data['total_minor']);
    }

    public function test_shipping_tax_when_shipping_taxable(): void
    {
        ShopSettings::saveTax((int) $this->user->tenant_id, ['enabled' => true, 'rate_percent' => 10, 'shipping_taxable' => true]);

        $data = $this->checkout(100000, ['shipping_minor' => 5000]);

        $this->assertSame(10500, (int) $data['tax_minor']);
        $this->assertSame(115500, (int) $data['total_minor']);
        $this->assertSame(500, (int) Order::query()->findOrFail($data['id'])->meta['tax_lines'][0]['shipping_tax']);
    }

    public function test_calc_taxes_off_in_general_settings_disables_tax(): void
    {
        $tid = (int) $this->user->tenant_id;
        ShopSettings::saveTax($tid, ['enabled' => true, 'rate_percent' => 10]);
        ShopSettings::saveGeneral($tid, array_merge(ShopSettings::getGeneral($tid), ['calc_taxes' => false]));

        $this->assertSame(100000, (int) $this->checkout(100000)['total_minor']);
    }
}
