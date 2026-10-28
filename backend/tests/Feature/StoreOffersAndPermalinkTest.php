<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Tenant;
use App\Models\WordpressRedirect;
use App\Services\Seo\SeoSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StoreOffersAndPermalinkTest extends TestCase
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

    private function product(array $extra): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id, 'price_minor' => 100000, 'status' => 'publish',
            'is_hidden' => false, 'is_available' => true,
        ], $extra));
    }

    public function test_offers_scope_lists_only_live_sales_soonest_first_with_end_and_stock(): void
    {
        $this->product(['name' => 'بی‌تخفیف', 'slug' => 'plain']);
        $this->product(['name' => 'دیر', 'slug' => 'late', 'sale_price_minor' => 80000, 'sale_ends_at' => now()->addDays(5)]);
        $this->product(['name' => 'زود', 'slug' => 'soon', 'sale_price_minor' => 70000, 'sale_ends_at' => now()->addHours(3), 'manage_stock' => true, 'stock' => 4]);

        $res = $this->withHeader('Host', 'shop.test')->getJson('/api/v1/public/catalog?offers=1&sort=ending_soon')->assertOk();
        $res->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.items.0.slug', 'soon')
            ->assertJsonPath('data.items.0.stock', 4)
            ->assertJsonPath('data.items.1.slug', 'late');
        $this->assertNotNull($res->json('data.items.0.sale_ends_at'));
    }

    public function test_wordpress_redirects_resolve_and_root_permalinks_stay_canonical(): void
    {
        $tid = $this->tenant->id;
        $this->product(['name' => 'رژ', 'slug' => 'sheglam-lip']);
        WordpressRedirect::query()->create(['tenant_id' => $tid, 'from_path' => '/sheglam-lip/', 'to_path' => '/product/sheglam-lip', 'status_code' => 301, 'kind' => 'permalink', 'resource' => 'products', 'external_id' => '1']);
        WordpressRedirect::query()->create(['tenant_id' => $tid, 'from_path' => '/?p=55', 'to_path' => '/product/sheglam-lip', 'status_code' => 301, 'kind' => 'redirect', 'resource' => 'redirects', 'external_id' => '2']);
        WordpressRedirect::query()->create(['tenant_id' => $tid, 'from_path' => '/old-offer/', 'to_path' => '/amazing-offers', 'status_code' => 301, 'kind' => 'redirect', 'resource' => 'redirects', 'external_id' => '3']);

        $h = fn () => $this->withHeader('Host', 'shop.test');
        // Default base: old root URL 301s to /product/{slug}.
        $h()->getJson('/api/v1/public/seo/redirect?path=/sheglam-lip')->assertOk()
            ->assertJsonPath('data.to_path', '/product/sheglam-lip')->assertJsonPath('data.status_code', 301);
        $h()->getJson('/api/v1/public/seo/redirect?path=/old-offer')->assertOk()->assertJsonPath('data.to_path', '/amazing-offers');

        app(SeoSettingsService::class)->save($tid, ['product_permalink_base' => '']);
        // Root base: /{slug} is canonical → no bounce; canonical + sitemap use the root URL.
        $r = $h()->getJson('/api/v1/public/seo/redirect?path=/sheglam-lip')->assertOk(); $this->assertNull($r->json('data.to_path'));
        $h()->getJson('/api/v1/public/seo/redirect?path=/old-offer')->assertOk()->assertJsonPath('data.to_path', '/amazing-offers');
        $meta = $h()->getJson('/api/v1/public/seo/meta?type=product&slug=sheglam-lip')->assertOk()->json('data.meta.canonical');
        $this->assertStringEndsWith('/sheglam-lip', (string) $meta);
        $this->assertStringNotContainsString('/product/', (string) $meta);
        $xml = $h()->get('/api/v1/public/seo/sitemap/products')->assertOk()->getContent();
        $this->assertStringContainsString('/sheglam-lip</loc>', (string) $xml);
        $this->assertStringNotContainsString('/product/sheglam-lip', (string) $xml);
    }
}
