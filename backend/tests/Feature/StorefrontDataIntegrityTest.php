<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\RoleCapability;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Seo\SeoMetaBuilder;
use App\Support\BuilderWidgetAliases;
use App\Support\CapabilityChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StorefrontDataIntegrityTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        $this->enableSubmodules($this->tenant->id, ['commerce.catalog' => true]);
    }

    private function product(array $extra = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'گوشی',
            'slug' => 'phone-'.uniqid(),
            'price_minor' => 1000,
            'currency' => 'IRR',
            'status' => 'publish',
            'stock' => 5,
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => false,
            'type' => 'simple',
        ], $extra));
    }

    public function test_product_breadcrumb_json_ld_includes_category_chain(): void
    {
        $category = Category::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'موبایل', 'slug' => 'mobile']);
        $product = $this->product(['category_id' => $category->id]);

        $graphs = app(SeoMetaBuilder::class)->jsonLdGraphs($this->tenant, [
            'site_name' => 'Shop',
            'canonical' => 'https://shop.test/product/'.$product->slug,
        ], $product);

        $crumbs = collect($graphs)->firstWhere('@type', 'BreadcrumbList');
        $this->assertNotNull($crumbs);
        $items = $crumbs['itemListElement'];
        $this->assertCount(4, $items);
        $this->assertSame([1, 2, 3, 4], array_column($items, 'position'));
        $this->assertSame('https://shop.test/', $items[0]['item']);
        $this->assertSame('https://shop.test/shop?category=mobile', $items[2]['item']);
        $this->assertSame('موبایل', $items[2]['name']);
        $this->assertSame($product->name, $items[3]['name']);
    }

    public function test_breadcrumb_without_category_has_three_items(): void
    {
        $product = $this->product();
        $graphs = app(SeoMetaBuilder::class)->jsonLdGraphs($this->tenant, ['canonical' => 'https://shop.test/product/x'], $product);
        $crumbs = collect($graphs)->firstWhere('@type', 'BreadcrumbList');
        $this->assertCount(3, $crumbs['itemListElement']);
    }

    public function test_wishlist_returns_cover_image_with_fallback(): void
    {
        RoleCapability::query()->firstOrCreate(['role' => 'customer', 'capability' => 'account.portal']);
        CapabilityChecker::flushRoleCache('customer');
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $this->actingAs($user, 'sanctum');

        $withCover = $this->product(['cover_image_url' => 'https://cdn.test/cover.webp', 'image_url' => 'https://cdn.test/img.webp']);
        $plain = $this->product(['image_url' => 'https://cdn.test/only.webp']);

        $this->postJson('/api/v1/account/favorites/'.$withCover->id)->assertSuccessful();
        $this->postJson('/api/v1/account/favorites/'.$plain->id)->assertSuccessful();

        $data = collect($this->getJson('/api/v1/account/favorites')->assertOk()->json('data.products'));
        $this->assertSame('https://cdn.test/cover.webp', $data->firstWhere('id', $withCover->id)['image_url']);
        $this->assertSame('https://cdn.test/only.webp', $data->firstWhere('id', $plain->id)['image_url']);
    }

    public function test_legacy_widget_aliases_are_migrated_without_touching_other_keys(): void
    {
        $doc = ['sections' => [['type' => 'section', 'columns' => [['widgets' => [
            ['id' => 'a', 'type' => 'checkout-stub', 'props' => ['type' => 'keep-me']],
            ['id' => 'b', 'type' => 'account-stub', 'props' => []],
            ['id' => 'c', 'type' => 'heading', 'props' => ['text' => 'checkout-stub']],
        ]]]]]];
        [$out, $count] = BuilderWidgetAliases::migrate($doc);
        $widgets = $out['sections'][0]['columns'][0]['widgets'];
        $this->assertSame(2, $count);
        $this->assertSame('checkout', $widgets[0]['type']);
        $this->assertSame('keep-me', $widgets[0]['props']['type']);
        $this->assertSame('account', $widgets[1]['type']);
        $this->assertSame('checkout-stub', $widgets[2]['props']['text']);
        $this->assertSame(0, BuilderWidgetAliases::migrate($out)[1]);
    }

    public function test_story_slides_round_trip_and_validation(): void
    {
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/shop/product-stories', [
            'title' => 'Sale',
            'media_url' => 'https://cdn.test/1.webp',
            'slides' => [
                ['media_url' => 'https://cdn.test/2.mp4', 'media_type' => 'video'],
                ['media_url' => 'https://cdn.test/3.webp', 'duration' => 8],
            ],
            'is_active' => true,
        ])->assertCreated()->assertJsonPath('data.slides.0.media_type', 'video');

        $this->postJson('/api/v1/shop/product-stories', [
            'title' => 'Bad',
            'media_url' => 'https://cdn.test/1.webp',
            'slides' => [['media_type' => 'gif']],
        ])->assertUnprocessable();

        $this->withHeader('Host', $this->tenant->domain)
            ->getJson('/api/v1/public/product-stories')
            ->assertOk()
            ->assertJsonPath('data.items.0.slides.1.duration', 8);
    }
}
