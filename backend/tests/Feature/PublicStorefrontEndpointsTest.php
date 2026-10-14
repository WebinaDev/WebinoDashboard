<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Coupon;
use App\Models\NewsletterSubscriber;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicStorefrontEndpointsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'shop.storefront.test']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.cart' => true,
            'commerce.checkout' => true,
            'marketing.coupons' => true,
        ]);
    }

    private function pub(): static
    {
        return $this->withHeader('X-Tenant-Domain', 'shop.storefront.test');
    }

    private function order(array $over = []): Order
    {
        return Order::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'number' => 'WB-1001',
            'status' => 'processing',
            'total_minor' => 250000,
            'subtotal_minor' => 250000,
            'currency' => 'IRR',
            'customer_phone' => '09121234567',
            'customer_email' => 'buyer@example.com',
            'customer_name' => 'Secret Name',
            'meta' => ['tracking_code' => 'TRK-55'],
        ], $over));
    }

    public function test_newsletter_subscribe_validates_and_dedupes(): void
    {
        $this->pub()->postJson('/api/v1/public/newsletter/subscribe', [])->assertStatus(422);
        $this->pub()->postJson('/api/v1/public/newsletter/subscribe', ['email' => 'not-an-email'])->assertStatus(422);
        $this->pub()->postJson('/api/v1/public/newsletter/subscribe', ['phone' => '123'])->assertStatus(422);

        $this->pub()->postJson('/api/v1/public/newsletter/subscribe', ['email' => 'A@Example.com'])->assertCreated();
        $this->pub()->postJson('/api/v1/public/newsletter/subscribe', ['email' => 'a@example.com'])->assertCreated();
        $this->pub()->postJson('/api/v1/public/newsletter/subscribe', ['phone' => '۰۹۱۲۱۲۳۴۵۶۷'])->assertCreated();

        $this->assertSame(1, NewsletterSubscriber::query()->where('email', 'a@example.com')->count());
        $this->assertSame(1, NewsletterSubscriber::query()->where('phone', '09121234567')->count());
    }

    public function test_admin_can_list_subscribers_scoped_to_tenant(): void
    {
        NewsletterSubscriber::query()->create(['tenant_id' => $this->tenant->id, 'email' => 'x@example.com']);
        $other = $this->createTenant();
        NewsletterSubscriber::query()->create(['tenant_id' => $other->id, 'email' => 'y@example.com']);
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);

        $rows = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/shop/newsletter-subscribers')->assertOk()->json('data');
        $this->assertCount(1, $rows);
        $this->assertSame('x@example.com', $rows[0]['email']);
    }

    public function test_order_tracking_requires_matching_contact_and_leaks_nothing(): void
    {
        $this->order();

        $this->pub()->postJson('/api/v1/public/orders/track', ['number' => 'WB-1001', 'contact' => '09120000000'])->assertNotFound();
        $this->pub()->postJson('/api/v1/public/orders/track', ['number' => 'WB-9999', 'contact' => '09121234567'])->assertNotFound();

        $data = $this->pub()->postJson('/api/v1/public/orders/track', ['number' => 'WB-1001', 'contact' => '+98 912 123 4567'])
            ->assertOk()->json('data');
        $this->assertSame('processing', $data['status']);
        $this->assertSame('TRK-55', $data['tracking_code']);
        $this->assertArrayNotHasKey('customer_name', $data);
        $this->assertArrayNotHasKey('shipping_address', $data);

        $this->pub()->postJson('/api/v1/public/orders/track', ['number' => 'WB-1001', 'contact' => 'BUYER@example.com'])->assertOk();
    }

    public function test_coupon_preview_returns_discount_or_422(): void
    {
        Coupon::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => 'OFF10',
            'type' => 'percent',
            'amount' => 10,
            'status' => 'publish',
        ]);

        $this->pub()->postJson('/api/v1/public/coupons/preview', ['code' => 'nope', 'subtotal_minor' => 100000])->assertStatus(422);
        $data = $this->pub()->postJson('/api/v1/public/coupons/preview', ['code' => 'off10', 'subtotal_minor' => 100000])->assertOk()->json('data');
        $this->assertSame(10000, $data['discount_minor']);
        $this->assertSame('OFF10', $data['code']);
    }

    public function test_category_tree_nests_children(): void
    {
        $root = Category::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'آرایشی', 'slug' => 'makeup']);
        Category::query()->create(['tenant_id' => $this->tenant->id, 'parent_id' => $root->id, 'name' => 'رژ لب', 'slug' => 'lipstick']);

        $tree = $this->pub()->getJson('/api/v1/public/catalog/categories/tree')->assertOk()->json('data.tree');
        $this->assertCount(1, $tree);
        $this->assertSame('lipstick', $tree[0]['children'][0]['slug']);
        $this->assertSame($root->id, $tree[0]['children'][0]['parent_id']);
    }

    public function test_best_selling_sort_uses_paid_order_quantities(): void
    {
        $a = Product::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'slug' => 'a', 'price_minor' => 1000, 'currency' => 'IRR', 'status' => 'publish']);
        $b = Product::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'slug' => 'b', 'price_minor' => 1000, 'currency' => 'IRR', 'status' => 'publish']);
        $paid = $this->order(['number' => 'P1', 'status' => 'completed']);
        $cancelled = $this->order(['number' => 'C1', 'status' => 'cancelled']);
        OrderItem::query()->create(['order_id' => $paid->id, 'product_id' => $a->id, 'product_name' => 'A', 'quantity' => 5, 'unit_price_minor' => 1000]);
        OrderItem::query()->create(['order_id' => $cancelled->id, 'product_id' => $b->id, 'product_name' => 'B', 'quantity' => 50, 'unit_price_minor' => 1000]);

        $items = $this->pub()->getJson('/api/v1/public/catalog?sort=best_selling')->assertOk()->json('data.items');
        $this->assertSame('a', $items[0]['slug']);
    }
}
