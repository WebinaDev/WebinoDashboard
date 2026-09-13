<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShopManagementApiTest extends TestCase
{
    use RefreshDatabase;

    protected function shopUser(): User
    {
        $tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop',
            'domain' => 'shop.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRR',
        ]);

        $this->enableSubmodules($tenant->id, [
            'commerce.catalog' => true,
            'commerce.brands' => true,
            'commerce.attributes' => true,
            'commerce.variants' => true,
            'commerce.pricing' => true,
            'commerce.marketplace' => true,
            'coffee-profile.profile' => true,
        ]);

        /** @var User $user */
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);

        return $user;
    }

    public function test_brand_category_attribute_and_product_crud(): void
    {
        $user = $this->shopUser();
        $this->actingAs($user, 'sanctum');

        $brand = $this->postJson('/api/v1/brands', [
            'name' => 'Acme',
            'description' => 'Brand',
        ])->assertCreated()->json('data');

        $this->assertSame('Acme', $brand['name']);

        $cat = $this->postJson('/api/v1/categories', [
            'name' => 'Electronics',
            'parent_id' => null,
        ])->assertCreated()->json('data');

        $attr = $this->postJson('/api/v1/attributes', [
            'name' => 'Color',
            'type' => 'color',
        ])->assertCreated()->json('data');

        $term = $this->postJson('/api/v1/attributes/'.$attr['id'].'/terms', [
            'name' => 'Red',
            'color' => '#ff0000',
        ])->assertCreated()->json('data');

        $this->assertSame('Red', $term['name']);

        $product = $this->postJson('/api/v1/products', [
            'name' => 'Phone',
            'price_minor' => 1000000,
            'purchase_price_minor' => 800000,
            'brand_ids' => [$brand['id']],
            'category_ids' => [$cat['id']],
            'english_name' => 'Phone EN',
            'labels' => ['has_warranty' => true],
            'type' => 'simple',
            'status' => 'publish',
        ])->assertCreated()->json('data');

        $this->assertGreaterThan(800000, $product['price_minor']);
        $this->assertSame('Phone EN', $product['english_name']);

        $this->getJson('/api/v1/products/'.$product['id'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Phone');

        $this->putJson('/api/v1/products/'.$product['id'].'/attributes', [
            'attributes' => [
                ['id' => $attr['id'], 'is_variation' => true, 'term_ids' => [$term['id']]],
            ],
        ])->assertOk();

        $this->postJson('/api/v1/products/'.$product['id'].'/duplicate')
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft');
    }

    public function test_pricing_quick_add_and_bulk_price_change(): void
    {
        $user = $this->shopUser();
        $this->actingAs($user, 'sanctum');

        $created = $this->postJson('/api/v1/pricing/quick-add', [
            'name' => 'Quick item',
            'purchase_price_minor' => 50000,
        ])->assertCreated()->json('data');

        $this->assertSame('Quick item', $created['name']);
        $this->assertSame(50000, $created['purchase_price_minor']);
        $this->assertGreaterThan(50000, $created['price_minor']);

        $this->postJson('/api/v1/pricing/bulk-price-change/start', [
            'change_type' => 'percent',
            'value' => 10,
            'rounding' => true,
            'round_step' => 1000,
        ])->assertOk();

        $this->getJson('/api/v1/pricing/bulk-price-change/state')
            ->assertOk()
            ->assertJsonPath('data.status', 'done');
    }

    public function test_marketplace_maps_and_coffee_profile(): void
    {
        $user = $this->shopUser();
        $this->actingAs($user, 'sanctum');

        $product = Product::query()->create([
            'tenant_id' => $user->tenant_id,
            'name' => 'Mapped',
            'slug' => 'mapped',
            'price_minor' => 1000,
            'currency' => 'IRR',
            'status' => 'publish',
        ]);

        $this->postJson('/api/v1/marketplace/products/'.$product->id.'/maps', [
            'maps' => [
                [
                    'platform' => 'digikala',
                    'remote_product_id' => '123',
                    'sync_enabled' => true,
                ],
            ],
        ])->assertOk()
            ->assertJsonFragment(['platform' => 'digikala', 'remote_product_id' => '123']);

        $this->putJson('/api/v1/products/'.$product->id.'/coffee-profile', [
            'blend_arabica' => 70,
            'blend_robusta' => 30,
            'caffeine_mg' => 120,
        ])->assertOk()
            ->assertJsonPath('data.blend_arabica', 70);

        $this->getJson('/api/v1/coffee/origins')->assertOk();
    }

    public function test_hierarchical_brand_and_category(): void
    {
        $user = $this->shopUser();
        $this->actingAs($user, 'sanctum');

        $parent = Brand::query()->create([
            'tenant_id' => $user->tenant_id,
            'name' => 'Parent',
            'slug' => 'parent',
        ]);

        $this->postJson('/api/v1/brands', [
            'name' => 'Child',
            'parent_id' => $parent->id,
        ])->assertCreated()->assertJsonPath('data.parent_id', $parent->id);

        $rootCat = Category::query()->create([
            'tenant_id' => $user->tenant_id,
            'name' => 'Root',
            'slug' => 'root',
        ]);

        $this->postJson('/api/v1/categories', [
            'name' => 'Child cat',
            'parent_id' => $rootCat->id,
        ])->assertCreated()->assertJsonPath('data.parent_id', $rootCat->id);
    }
}
