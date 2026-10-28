<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StoreSlugResolverTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Parisma', 'slug' => 'parisma', 'domain' => 'shop.test', 'license_key' => 'k',
            'provision_token' => 'site-token', 'setup_completed' => true, 'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, ['commerce.catalog' => true, 'commerce.checkout' => true]);
    }

    public function test_resolves_product_category_brand_and_filters(): void
    {
        $tid = $this->tenant->id;
        $cat = Category::query()->create(['tenant_id' => $tid, 'name' => 'مراقبت پوست', 'slug' => 'skin-care']);
        Brand::query()->create(['tenant_id' => $tid, 'name' => 'شیگلم', 'slug' => 'sheglam']);
        Product::query()->create(['tenant_id' => $tid, 'category_id' => $cat->id, 'name' => 'رژ', 'slug' => 'sheglam-lip', 'price_minor' => 100000, 'status' => 'publish', 'is_hidden' => false, 'is_available' => true, 'shipping_time' => 0]);
        Product::query()->create(['tenant_id' => $tid, 'category_id' => $cat->id, 'name' => 'کرم', 'slug' => 'cream', 'price_minor' => 500000, 'status' => 'publish', 'is_hidden' => false, 'is_available' => true, 'shipping_time' => 3]);

        $h = fn () => $this->withHeader('Host', 'shop.test');
        $h()->getJson('/api/v1/public/catalog/resolve-slug?slug=sheglam-lip')->assertOk()->assertJsonPath('data.type', 'product');
        $h()->getJson('/api/v1/public/catalog/resolve-slug?slug=skin-care')->assertOk()->assertJsonPath('data.type', 'category');
        $h()->getJson('/api/v1/public/catalog/resolve-slug?slug=sheglam&scope=brand')->assertOk()->assertJsonPath('data.type', 'brand');
        $h()->getJson('/api/v1/public/catalog/resolve-slug?slug=nope')->assertNotFound();

        $h()->getJson('/api/v1/public/catalog?same_day=1')->assertOk()->assertJsonCount(1, 'data.items');
        $h()->getJson('/api/v1/public/catalog?facets=1')->assertOk()
            ->assertJsonPath('data.facets.price.min', 100000)
            ->assertJsonPath('data.facets.price.max', 500000)
            ->assertJsonPath('data.facets.same_day_count', 1);

        $h()->getJson('/api/v1/public/seo/meta?type=category&slug=skin-care&path=/skin-care')->assertOk()
            ->assertJsonPath('data.meta.title', fn ($t) => str_contains((string) $t, 'مراقبت پوست'));
        $h()->getJson('/api/v1/public/seo/meta?path=/shop&fallback_title=فروشگاه')->assertOk()
            ->assertJsonPath('data.meta.title', fn ($t) => str_contains((string) $t, 'فروشگاه'));
    }
}
