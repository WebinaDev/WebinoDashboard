<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Coupons\CouponService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CouponOffersTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        $this->enableSubmodules($this->tenant->id, [
            'marketing.coupons' => true,
            'commerce.checkout' => true,
            'commerce.cart' => true,
            'commerce.catalog' => true,
        ]);
        /** @var User $user */
        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
            'email' => 'buyer@example.com',
        ]);
        $this->user = $user;
    }

    protected function service(): CouponService
    {
        return app(CouponService::class);
    }

    protected function product(array $overrides = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'P',
            'slug' => 'p-'.uniqid(),
            'price_minor' => 10000,
            'currency' => 'IRR',
            'status' => 'publish',
        ], $overrides));
    }

    protected function coupon(array $overrides = []): Coupon
    {
        return Coupon::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'code' => 'C'.strtoupper(uniqid()),
            'type' => 'percent',
            'amount' => 10,
            'status' => 'publish',
        ], $overrides));
    }

    protected function paidOrder(string $status = 'completed'): Order
    {
        return Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'status' => $status,
            'subtotal_minor' => 1000,
            'total_minor' => 1000,
            'currency' => 'IRR',
        ]);
    }

    public function test_exclude_sale_skips_sale_lines_from_eligible_subtotal(): void
    {
        $regular = $this->product(['price_minor' => 10000]);
        $sale = $this->product(['price_minor' => 20000, 'sale_price_minor' => 15000]);
        $coupon = $this->coupon(['exclude_sale' => true]);

        $lines = [
            ['product_id' => $regular->id, 'unit_price_minor' => 10000, 'quantity' => 1],
            ['product_id' => $sale->id, 'unit_price_minor' => 15000, 'quantity' => 2],
        ];

        $result = $this->service()->apply($this->tenant->id, $coupon->code, 40000, $lines, $this->user->id);

        $this->assertSame(1000, $result['discount_minor']);
    }

    public function test_exclude_sale_rejects_cart_with_only_sale_items(): void
    {
        $sale = $this->product(['price_minor' => 20000, 'sale_price_minor' => 15000]);
        $coupon = $this->coupon(['exclude_sale' => true]);

        $this->expectException(ValidationException::class);
        $this->service()->apply($this->tenant->id, $coupon->code, 15000, [
            ['product_id' => $sale->id, 'unit_price_minor' => 15000, 'quantity' => 1],
        ], $this->user->id);
    }

    public function test_order_nth_condition_matches_only_the_given_order_number(): void
    {
        $product = $this->product();
        $lines = [['product_id' => $product->id, 'unit_price_minor' => 10000, 'quantity' => 1]];
        $coupon = $this->coupon(['condition_type' => 'order_nth', 'condition_value' => 2]);

        try {
            $this->service()->apply($this->tenant->id, $coupon->code, 10000, $lines, $this->user->id);
            $this->fail('Coupon should not apply on the first order');
        } catch (ValidationException) {
        }

        $this->paidOrder('completed');
        $this->paidOrder('pending_payment');

        $result = $this->service()->apply($this->tenant->id, $coupon->code, 10000, $lines, $this->user->id);
        $this->assertSame(1000, $result['discount_minor']);

        $this->paidOrder('paid');

        $this->expectException(ValidationException::class);
        $this->service()->apply($this->tenant->id, $coupon->code, 10000, $lines, $this->user->id);
    }

    public function test_min_items_condition_and_max_discount_cap(): void
    {
        $product = $this->product();
        $coupon = $this->coupon([
            'amount' => 50,
            'condition_type' => 'min_items',
            'condition_value' => 3,
            'max_discount_minor' => 5000,
        ]);

        $result = $this->service()->apply($this->tenant->id, $coupon->code, 30000, [
            ['product_id' => $product->id, 'unit_price_minor' => 10000, 'quantity' => 3],
        ], $this->user->id);
        $this->assertSame(5000, $result['discount_minor']);

        $this->expectException(ValidationException::class);
        $this->service()->apply($this->tenant->id, $coupon->code, 20000, [
            ['product_id' => $product->id, 'unit_price_minor' => 10000, 'quantity' => 2],
        ], $this->user->id);
    }

    public function test_brand_and_email_restrictions(): void
    {
        $branded = $this->product(['price_minor' => 10000]);
        $other = $this->product(['price_minor' => 30000]);
        $brand = Brand::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'B',
            'slug' => 'b',
        ]);
        $branded->brands()->attach($brand->id);

        $coupon = $this->coupon([
            'amount' => 50,
            'restrictions' => ['brand_ids' => [$brand->id], 'emails' => ['*@example.com']],
        ]);

        $result = $this->service()->apply($this->tenant->id, $coupon->code, 40000, [
            ['product_id' => $branded->id, 'unit_price_minor' => 10000, 'quantity' => 1],
            ['product_id' => $other->id, 'unit_price_minor' => 30000, 'quantity' => 1],
        ], $this->user->id);
        $this->assertSame(5000, $result['discount_minor']);

        $stranger = User::factory()->create(['tenant_id' => $this->tenant->id, 'email' => 'x@other.test']);
        $this->expectException(ValidationException::class);
        $this->service()->apply($this->tenant->id, $coupon->code, 10000, [
            ['product_id' => $branded->id, 'unit_price_minor' => 10000, 'quantity' => 1],
        ], $stranger->id);
    }

    public function test_shipping_after_applies_free_shipping_and_percent(): void
    {
        $this->assertSame(0, $this->service()->shippingAfter(['free_shipping' => true, 'shipping_percent' => 0], 5000));
        $this->assertSame(3500, $this->service()->shippingAfter(['free_shipping' => false, 'shipping_percent' => 30], 5000));
        $this->assertSame(5000, $this->service()->shippingAfter(['free_shipping' => false, 'shipping_percent' => 0], 5000));
    }

    public function test_checkout_auto_applies_best_coupon_and_zeroes_shipping(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $product = $this->product(['price_minor' => 10000]);
        $this->coupon(['code' => 'AUTO5', 'amount' => 5, 'auto_apply' => true]);
        $this->coupon(['code' => 'AUTO20', 'amount' => 20, 'auto_apply' => true, 'free_shipping' => true]);
        $this->coupon(['code' => 'MANUAL50', 'amount' => 50]);
        $this->coupon(['code' => 'AUTODRAFT', 'amount' => 90, 'auto_apply' => true, 'status' => 'draft']);

        $cart = Cart::query()->create(['tenant_id' => $this->tenant->id, 'user_id' => $this->user->id]);
        CartItem::query()->create(['cart_id' => $cart->id, 'product_id' => $product->id, 'quantity' => 1]);

        $order = $this->postJson('/api/v1/checkout', ['channel' => 'site', 'shipping_minor' => 5000])
            ->assertCreated()
            ->json('data');

        $this->assertSame('AUTO20', $order['coupon_code']);
        $this->assertSame(2000, $order['discount_minor']);
        $this->assertSame(0, $order['shipping_minor']);
        $this->assertSame(8000, $order['total_minor']);
    }

    public function test_index_filters_expired_coupons(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $this->coupon(['code' => 'OLD', 'expires_at' => now()->subDay()]);
        $this->coupon(['code' => 'NEW', 'expires_at' => now()->addDay()]);
        $this->coupon(['code' => 'FOREVER']);

        $this->getJson('/api/v1/marketing/coupons?expired=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.code', 'OLD');

        $this->getJson('/api/v1/marketing/coupons?expired=0')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_store_accepts_offer_fields(): void
    {
        $this->actingAs($this->user, 'sanctum');

        $this->postJson('/api/v1/marketing/coupons', [
            'code' => 'first10',
            'type' => 'percent',
            'amount' => 10,
            'status' => 'publish',
            'condition_type' => 'order_nth',
            'condition_value' => 1,
            'auto_apply' => true,
            'max_discount_minor' => 50000,
            'shipping_percent' => 50,
        ])->assertCreated()
            ->assertJsonPath('data.code', 'FIRST10')
            ->assertJsonPath('data.condition_type', 'order_nth')
            ->assertJsonPath('data.auto_apply', true)
            ->assertJsonPath('data.shipping_percent', 50);
    }
}
