<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\DashboardModule;
use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommerceAndSetupTest extends TestCase
{
    use RefreshDatabase;

    protected function actingTenantUser(): User
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 't1',
            'domain' => 'localhost',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRR',
        ]);

        foreach (['dashboard', 'catalog', 'cart', 'checkout', 'analytics'] as $slug) {
            DashboardModule::query()->create([
                'slug' => $slug,
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
            'analytics.overview' => true,
        ]);

        /** @var User $user */
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);

        return $user;
    }

    public function test_setup_status_requires_auth(): void
    {
        $this->getJson('/api/v1/setup/status')->assertStatus(401);
    }

    public function test_setup_status_returns_flags(): void
    {
        $user = $this->actingTenantUser();
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/setup/status')
            ->assertOk()
            ->assertJsonPath('data.setup_completed', true);
    }

    public function test_analytics_open_orders_excludes_failed(): void
    {
        $user = $this->actingTenantUser();
        $tid = $user->tenant_id;

        Order::query()->create([
            'tenant_id' => $tid,
            'user_id' => $user->id,
            'status' => 'payment_failed',
            'total_minor' => 0,
            'currency' => 'IRR',
        ]);
        Order::query()->create([
            'tenant_id' => $tid,
            'user_id' => $user->id,
            'status' => 'pending_payment',
            'total_minor' => 1000,
            'currency' => 'IRR',
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/analytics/summary')
            ->assertOk()
            ->assertJsonPath('data.orders_open', 1);
    }

    public function test_checkout_persists_shipping_meta(): void
    {
        $user = $this->actingTenantUser();
        $tid = $user->tenant_id;

        $cat = Category::query()->create([
            'tenant_id' => $tid,
            'name' => 'C',
            'slug' => 'c',
        ]);
        $product = Product::query()->create([
            'tenant_id' => $tid,
            'category_id' => $cat->id,
            'name' => 'P',
            'sku' => 's',
            'price_minor' => 1000,
            'currency' => 'IRR',
            'stock' => 5,
        ]);

        \App\Models\Cart::query()->create([
            'tenant_id' => $tid,
            'user_id' => $user->id,
        ]);
        $cart = \App\Models\Cart::query()->where('tenant_id', $tid)->where('user_id', $user->id)->first();
        \App\Models\CartItem::query()->create([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
            'quantity' => 1,
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/checkout', [
                'shipping_address' => 'Tehran',
                'customer_phone' => '0912',
                'customer_note' => 'Hi',
            ])
            ->assertCreated()
            ->assertJsonPath('data.shipping_address', 'Tehran');

        $this->assertDatabaseHas('orders', [
            'tenant_id' => $tid,
            'customer_phone' => '0912',
        ]);
    }
}
