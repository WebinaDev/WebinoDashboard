<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductTrashTest extends TestCase
{
    use RefreshDatabase;

    public function test_product_trash_is_hidden_then_restored_and_force_deleted(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop-trash',
            'domain' => 'trash.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRR',
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $product = Product::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Bean',
            'slug' => 'bean',
            'price_minor' => 1000,
            'status' => 'publish',
        ]);

        $this->actingAs($user, 'sanctum');

        $this->deleteJson('/api/v1/products/'.$product->id)->assertOk();
        $this->assertDatabaseHas('products', ['id' => $product->id, 'status' => 'trash']);

        $visible = collect($this->getJson('/api/v1/products?page=1')->json('data'))->pluck('id');
        $this->assertFalse($visible->contains($product->id));

        $trashed = collect($this->getJson('/api/v1/products?page=1&status=trash')->json('data'))->pluck('id');
        $this->assertTrue($trashed->contains($product->id));

        $this->deleteJson('/api/v1/products/'.$product->id.'?force=1')->assertOk();
        $this->assertDatabaseMissing('products', ['id' => $product->id]);
    }

    public function test_brand_delete_moves_to_trash_until_forced(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop-brand-trash',
            'domain' => 'brand-trash.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRR',
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $brand = Brand::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Roaster',
            'slug' => 'roaster',
            'status' => 'publish',
        ]);

        $this->actingAs($user, 'sanctum');
        $this->deleteJson('/api/v1/brands/'.$brand->id)->assertOk();
        $this->assertDatabaseHas('brands', ['id' => $brand->id, 'status' => 'trash']);
        $ids = collect($this->getJson('/api/v1/brands')->json('data'))->pluck('id');
        $this->assertFalse($ids->contains($brand->id));

        $this->postJson('/api/v1/brands/'.$brand->id.'/restore')->assertOk();
        $this->assertDatabaseHas('brands', ['id' => $brand->id, 'status' => 'publish']);
    }
}
