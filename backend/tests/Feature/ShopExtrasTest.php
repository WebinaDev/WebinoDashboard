<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductDownload;
use App\Models\ProductReview;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Shop\LoyaltyService;
use App\Services\Shop\ShopSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class ShopExtrasTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop',
            'domain' => 'shop.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
        ]);
        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
            'loyalty_points' => 0,
        ]);
        $this->actingAs($this->user, 'sanctum');
    }

    public function test_download_without_valid_signature_is_forbidden(): void
    {
        Storage::fake('local');
        $product = $this->makeProduct(['type' => 'downloadable']);
        $path = 'downloads/t/file.bin';
        Storage::disk('local')->put($path, 'payload');
        $dl = ProductDownload::query()->create([
            'tenant_id' => $this->tenant->id,
            'product_id' => $product->id,
            'name' => 'file',
            'storage_path' => $path,
            'original_name' => 'file.bin',
        ]);
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'status' => 'paid',
            'subtotal_minor' => 1000,
            'total_minor' => 1000,
            'currency' => 'IRT',
        ]);
        $item = OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $product->id,
            'quantity' => 1,
            'unit_price_minor' => 1000,
        ]);

        $this->getJson("/api/v1/downloads/{$item->id}/{$dl->id}")->assertForbidden();
    }

    public function test_signed_download_increments_count(): void
    {
        Storage::fake('local');
        ShopSettings::saveDownloads($this->tenant->id, [
            'require_login' => false,
            'count_downloads' => true,
            'delivery_method' => 'force',
        ]);
        $product = $this->makeProduct(['type' => 'downloadable']);
        $path = 'downloads/t/file.bin';
        Storage::disk('local')->put($path, 'hello');
        $dl = ProductDownload::query()->create([
            'tenant_id' => $this->tenant->id,
            'product_id' => $product->id,
            'name' => 'file',
            'storage_path' => $path,
            'original_name' => 'file.bin',
        ]);
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'status' => 'paid',
            'subtotal_minor' => 1000,
            'total_minor' => 1000,
            'currency' => 'IRT',
        ]);
        $item = OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $product->id,
            'quantity' => 1,
            'unit_price_minor' => 1000,
            'download_count' => 0,
            'requires_login' => false,
        ]);

        $url = URL::temporarySignedRoute(
            'downloads.serve',
            now()->addMinutes(10),
            ['orderItem' => $item->id, 'download' => $dl->id]
        );

        $this->get($url)->assertOk();
        $this->assertSame(1, (int) $item->fresh()->download_count);
    }

    public function test_pending_review_hidden_from_public_list(): void
    {
        ShopSettings::saveReviews($this->tenant->id, [
            'enabled' => true,
            'require_approval' => true,
            'show_average' => true,
        ]);
        $product = $this->makeProduct(['slug' => 'reviewed']);
        ProductReview::query()->create([
            'tenant_id' => $this->tenant->id,
            'product_id' => $product->id,
            'rating' => 5,
            'body' => 'secret',
            'status' => 'pending',
        ]);
        ProductReview::query()->create([
            'tenant_id' => $this->tenant->id,
            'product_id' => $product->id,
            'rating' => 4,
            'body' => 'ok',
            'status' => 'approved',
        ]);

        $data = $this->getJson('/api/v1/public/catalog/items/reviewed/reviews', [
            'X-Tenant-Domain' => 'shop.test',
        ])->assertOk()->json('data');

        $this->assertCount(1, $data['items']);
        $this->assertSame('ok', $data['items'][0]['body']);
        $this->assertSame(4.0, (float) $data['average']);
    }

    public function test_maps_keys_are_masked_and_default_address_from_store(): void
    {
        ShopSettings::saveGeneral($this->tenant->id, [
            'store_address' => [
                'address_1' => 'Valiasr',
                'city' => 'Tehran',
                'country' => 'IR',
                'state' => 'Tehran',
                'postcode' => '123',
            ],
        ]);
        ShopSettings::saveMaps($this->tenant->id, [
            'billing_map_enabled' => true,
            'provider' => 'neshan',
            'api_key' => 'secret-key-abcdef',
            'service_api_key' => 'service-key-uvwxyz',
        ]);

        $maps = $this->getJson('/api/v1/settings/shop/maps')->assertOk()->json('data');
        $this->assertTrue($maps['api_key_set']);
        $this->assertStringContainsString('*', (string) $maps['api_key']);
        $this->assertStringNotContainsString('secret-key-abcdef', (string) $maps['api_key']);

        $addr = $this->getJson('/api/v1/maps/default-address')->assertOk()->json('data');
        $this->assertSame('Valiasr', $addr['address_1']);
        $this->assertSame('store_address', $addr['source']);
    }

    public function test_loyalty_awards_points_on_paid_order(): void
    {
        ShopSettings::saveLoyalty($this->tenant->id, [
            'enabled' => true,
            'point_price_minor' => 1000,
            'max_points_per_product' => 100,
        ]);
        $product = $this->makeProduct();
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'status' => 'paid',
            'subtotal_minor' => 5000,
            'total_minor' => 5000,
            'currency' => 'IRT',
        ]);
        OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $product->id,
            'quantity' => 1,
            'unit_price_minor' => 5000,
        ]);

        app(LoyaltyService::class)->awardForPaidOrder($order);

        $this->assertSame(5, (int) $this->user->fresh()->loyalty_points);
        $this->assertDatabaseHas('loyalty_ledger', [
            'order_id' => $order->id,
            'user_id' => $this->user->id,
            'points' => 5,
        ]);
    }

    public function test_archive_in_stock_filter_hides_outofstock(): void
    {
        ShopSettings::saveArchive($this->tenant->id, [
            'filter_in_stock' => true,
            'products_per_page' => 24,
        ]);
        $this->makeProduct(['name' => 'In', 'slug' => 'in', 'stock' => 3, 'stock_status' => 'instock']);
        $this->makeProduct(['name' => 'Out', 'slug' => 'out', 'stock' => 0, 'stock_status' => 'outofstock']);

        $data = $this->getJson('/api/v1/public/catalog?in_stock=1', [
            'X-Tenant-Domain' => 'shop.test',
        ])->assertOk()->json('data');

        $names = collect($data['items'])->pluck('name')->all();
        $this->assertContains('In', $names);
        $this->assertNotContains('Out', $names);
        $this->assertArrayHasKey('archive', $data);
    }

    /** @param  array<string, mixed>  $extra */
    private function makeProduct(array $extra = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'P',
            'slug' => 'p-'.uniqid(),
            'price_minor' => 1000,
            'currency' => 'IRT',
            'status' => 'publish',
            'stock' => 5,
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => false,
            'type' => 'simple',
        ], $extra));
    }
}
