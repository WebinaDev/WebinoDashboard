<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Pricing\PurchaseTypeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class BulkSaleScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
        ]);
        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
        $this->actingAs($this->admin, 'sanctum');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function makeProduct(array $overrides = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'Sale item',
            'slug' => 'sale-item-'.uniqid(),
            'price_minor' => 10000,
            'sale_price_minor' => null,
            'currency' => 'IRR',
            'status' => 'publish',
            'stock' => 5,
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => false,
            'type' => 'simple',
        ], $overrides));
    }

    public function test_apply_writes_sale_window_from_days(): void
    {
        Carbon::setTestNow('2026-09-28 10:00:00');
        $product = $this->makeProduct();

        $this->postJson('/api/v1/shop/products/bulk-sale', [
            'action' => 'apply',
            'percent' => 20,
            'days' => 3,
            'product_ids' => [$product->id],
        ])->assertOk()->assertJsonPath('data.ok', 1);

        $product->refresh();
        $this->assertSame(8000, (int) $product->sale_price_minor);
        $this->assertNotNull($product->sale_starts_at);
        $this->assertNotNull($product->sale_ends_at);
        $this->assertSame('2026-09-28 10:00:00', $product->sale_starts_at->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-01 10:00:00', $product->sale_ends_at->format('Y-m-d H:i:s'));
        $this->assertTrue($product->isOnSale());
        $this->assertSame(8000, $product->effectivePriceMinor());
    }

    public function test_apply_with_until_and_remove_clears_window(): void
    {
        Carbon::setTestNow('2026-09-28 10:00:00');
        $product = $this->makeProduct();

        $this->postJson('/api/v1/shop/products/bulk-sale', [
            'action' => 'apply',
            'percent' => 10,
            'until' => '2026-10-05',
            'product_ids' => [$product->id],
        ])->assertOk();

        $product->refresh();
        $this->assertSame('2026-10-05', $product->sale_ends_at->format('Y-m-d'));

        $this->postJson('/api/v1/shop/products/bulk-sale', [
            'action' => 'remove',
            'product_ids' => [$product->id],
        ])->assertOk();

        $product->refresh();
        $this->assertNull($product->sale_price_minor);
        $this->assertNull($product->sale_starts_at);
        $this->assertNull($product->sale_ends_at);
    }

    public function test_expired_sale_is_not_effective_price(): void
    {
        Carbon::setTestNow('2026-09-28 10:00:00');
        $product = $this->makeProduct([
            'sale_price_minor' => 7000,
            'sale_starts_at' => Carbon::parse('2026-09-20 00:00:00'),
            'sale_ends_at' => Carbon::parse('2026-09-27 00:00:00'),
        ]);

        $this->assertFalse($product->isOnSale());
        $this->assertNull($product->effectiveSalePriceMinor());
        $this->assertSame(10000, $product->effectivePriceMinor());
        $this->assertSame(10000, PurchaseTypeService::forTenant($this->tenant->id)->unitPrice($product, 'cash'));

        $row = collect($this->getJson('/api/v1/products?per_page=20&paginate=1')->assertOk()->json('data'))
            ->firstWhere('id', $product->id);
        $this->assertNotNull($row);
        $this->assertFalse($row['is_on_sale']);
    }

    public function test_future_sale_is_not_effective_until_start(): void
    {
        Carbon::setTestNow('2026-09-28 10:00:00');
        $product = $this->makeProduct([
            'sale_price_minor' => 7000,
            'sale_starts_at' => Carbon::parse('2026-10-01 00:00:00'),
            'sale_ends_at' => Carbon::parse('2026-10-10 00:00:00'),
        ]);

        $this->assertSame(10000, $product->effectivePriceMinor());

        Carbon::setTestNow('2026-10-02 00:00:00');
        $this->assertSame(7000, $product->effectivePriceMinor());
    }
}
