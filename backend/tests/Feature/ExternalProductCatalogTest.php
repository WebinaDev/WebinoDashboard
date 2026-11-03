<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExternalProductCatalogTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Catalog',
            'slug' => 'ext-catalog',
            'domain' => 'catalog.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Catalog',
            'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
        ]);
        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
    }

    public function test_digikala_search_maps_public_api(): void
    {
        Http::fake([
            'api.digikala.com/v1/search/*' => Http::response([
                'status' => 200,
                'data' => [
                    'products' => [[
                        'id' => 12345,
                        'title_fa' => 'گوشی تست',
                        'data_layer' => ['brand' => 'Apple'],
                        'images' => ['main' => ['url' => ['https://dkstatics-public.digikala.com/x.jpg']]],
                        'default_variant' => ['price' => ['selling_price' => 100000]],
                        'url' => ['uri' => '/product/dkp-12345/test'],
                    ]],
                    'pager' => ['total_pages' => 1],
                ],
            ]),
        ]);

        $this->actingAs($this->admin, 'sanctum');
        $this->getJson('/api/v1/product-catalog/search?source=digikala&q=phone')
            ->assertOk()
            ->assertJsonPath('data.source', 'digikala')
            ->assertJsonPath('data.items.0.id', '12345')
            ->assertJsonPath('data.items.0.brand', 'Apple')
            ->assertJsonPath('data.items.0.price_minor', 10000);
    }

    public function test_torob_search_and_import_upserts_by_sku(): void
    {
        Http::fake([
            'api.torob.com/v4/base-product/search/*' => Http::response([
                'results' => [[
                    'random_key' => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                    'name1' => 'پاوربانک تست',
                    'price' => 50000,
                    'image_url' => 'https://image.torob.com/x.jpg',
                    'web_client_absolute_url' => '/p/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/x/',
                    'shop_text' => 'در ۲ فروشگاه',
                ]],
                'next' => null,
            ]),
        ]);

        $this->actingAs($this->admin, 'sanctum');
        $search = $this->getJson('/api/v1/product-catalog/search?source=torob&q=powerbank')
            ->assertOk()
            ->json('data.items.0');

        $this->postJson('/api/v1/product-catalog/import', [
            'source' => $search['source'],
            'id' => $search['id'],
            'name' => $search['title'],
            'sku' => $search['sku'],
            'price_minor' => $search['price_minor'],
            'image_url' => $search['image_url'],
            'url' => $search['url'],
            'brand' => $search['brand'] ?? null,
        ])->assertCreated();

        $this->assertSame(1, Product::query()->where('tenant_id', $this->tenant->id)->where('sku', $search['sku'])->count());

        $this->postJson('/api/v1/product-catalog/import', [
            'source' => $search['source'],
            'id' => $search['id'],
            'name' => 'Updated title',
            'sku' => $search['sku'],
            'price_minor' => 60000,
            'url' => $search['url'],
        ])->assertOk()
            ->assertJsonPath('data.name', 'Updated title');

        $this->assertSame(1, Product::query()->where('tenant_id', $this->tenant->id)->where('sku', $search['sku'])->count());
    }

    public function test_technolife_keyword_search_needs_credentials_without_keys(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $this->getJson('/api/v1/product-catalog/sources')
            ->assertOk()
            ->assertJsonFragment(['key' => 'technolife', 'status' => 'needs_credentials']);

        $this->getJson('/api/v1/product-catalog/search?source=technolife&q=iphone')
            ->assertOk()
            ->assertJsonPath('data.status', 'needs_credentials')
            ->assertJsonPath('data.items', []);
    }

    public function test_technolife_product_url_reads_next_data(): void
    {
        $html = '<html><script id="__NEXT_DATA__">'.json_encode([
            'props' => [
                'pageProps' => [
                    'dehydratedState' => [
                        'queries' => [[
                            'state' => [
                                'data' => [
                                    'product_info' => [
                                        'id' => 9988,
                                        'title' => 'گوشی تکنولایف',
                                        'brand' => 'Samsung',
                                        'image' => 'https://cdn.technolife.com/x.jpg',
                                        'color_items' => [[
                                            'available' => 3,
                                            'discounted_price' => 120000,
                                        ]],
                                    ],
                                ],
                            ],
                        ]],
                    ],
                ],
            ],
        ]).'</script></html>';

        Http::fake([
            'www.technolife.com/*' => Http::response($html, 200, ['Content-Type' => 'text/html']),
            'technolife.com/*' => Http::response($html, 200, ['Content-Type' => 'text/html']),
        ]);

        $this->actingAs($this->admin, 'sanctum');
        $this->getJson('/api/v1/product-catalog/search?source=technolife&q=TLP-9988')
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.items.0.id', '9988')
            ->assertJsonPath('data.items.0.brand', 'Samsung')
            ->assertJsonPath('data.items.0.price_minor', 120000);
    }
}
