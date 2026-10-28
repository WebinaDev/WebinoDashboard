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

class CheckoutChequeAndLocationTest extends TestCase
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

    private function checkout(int $priceMinor, array $payload = [], int $expect = 201): array
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
            ->assertStatus($expect)
            ->json('data') ?? [];
    }

    public function test_checkout_stores_map_location(): void
    {
        $data = $this->checkout(1000, ['shipping_lat' => 35.6892, 'shipping_lng' => 51.389]);
        $this->assertEquals(['lat' => 35.6892, 'lng' => 51.389], $data['meta']['shipping_location']);
    }

    public function test_location_requires_both_coordinates(): void
    {
        $this->checkout(1000, ['shipping_lat' => 35.6], 422);
    }

    public function test_cheque_rejected_when_disabled_and_accepted_when_enabled(): void
    {
        $this->checkout(1000, ['payment_method' => 'cheque'], 422);
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/payments/gateways/cheque', ['enabled' => true, 'instructions' => 'Pay to X'])
            ->assertOk()->assertJsonPath('data.enabled', true)->assertJsonMissingPath('data.settings.callback_url');
        $data = $this->checkout(1000, ['payment_method' => 'cheque']);
        $this->assertSame('cheque', $data['meta']['payment_method']);
    }
}
