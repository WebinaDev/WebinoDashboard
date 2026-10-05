<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductCompareSession;
use App\Models\Tenant;
use App\Models\User;
use App\Models\VendorStore;
use App\Services\Shop\PersianProfanityFilter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IshopFeaturesTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop',
            'domain' => 'shop.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
        ]);
    }

    protected function product(): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Phone',
            'slug' => 'phone',
            'sku' => 'PH-1',
            'price_minor' => 1_000_000,
            'currency' => 'IRT',
            'stock' => 5,
            'manage_stock' => true,
            'status' => 'publish',
            'type' => 'simple',
        ]);
    }

    public function test_compare_add_and_list_public(): void
    {
        $product = $this->product();
        $this->postJson('/api/v1/public/compare/products/'.$product->id, [], ['HTTP_HOST' => 'shop.test'])
            ->assertOk()
            ->assertJsonPath('data.product_ids.0', $product->id);

        $this->getJson('/api/v1/public/compare', ['HTTP_HOST' => 'shop.test'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items');
    }

    public function test_price_history_recorded_on_update(): void
    {
        $product = $this->product();
        $product->update(['price_minor' => 1_200_000]);

        $this->getJson('/api/v1/public/catalog/items/phone/price-history', ['HTTP_HOST' => 'shop.test'])
            ->assertOk()
            ->assertJsonPath('data.points.0.price_minor', 1_200_000);
    }

    public function test_profanity_filter_blocks_review(): void
    {
        $this->assertTrue(app(PersianProfanityFilter::class)->containsProfanity('این متن کس است'));
    }

    public function test_save_for_later_cart_flow(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $product = $this->product();
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        $this->postJson('/api/v1/cart/items/'.$product->id.'/save-for-later')->assertOk();
        $this->getJson('/api/v1/cart/saved-for-later')
            ->assertOk()
            ->assertJsonPath('data.items.0.product_id', $product->id);

        $this->assertSame(0, ProductCompareSession::query()->count());
    }

    public function test_public_vendor_store_lists_products(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'seller']);
        $store = VendorStore::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $user->id,
            'name' => 'Beauty Hub',
            'slug' => 'beauty-hub',
            'status' => 'active',
        ]);
        $product = $this->product();
        $product->update(['vendor_store_id' => $store->id]);

        $this->getJson('/api/v1/public/vendor-stores/beauty-hub', ['HTTP_HOST' => 'shop.test'])
            ->assertOk()
            ->assertJsonPath('data.store.slug', 'beauty-hub')
            ->assertJsonPath('data.products.0.slug', 'phone');
    }
}
