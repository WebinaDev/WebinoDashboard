<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Modules\Cafe\Services\OrderIntake;
use Tests\TestCase;

/**
 * A dish the kitchen has run out of cannot be sold at the counter.
 *
 * This shipped broken: `CafePosController::catalogue()` answered `available => true` for every
 * product and never looked at `is_sold_out`, while the online menu filtered it correctly. The
 * result was a dish that vanished from the QR menu and kept selling at the till — the one
 * failure a point of sale must not have, because the cashier takes the money and the kitchen
 * cannot make the food.
 *
 * Two layers are tested here because either alone is insufficient: the feed tells the cashier,
 * and the service refuses the order. A screen is advice; the refusal is the rule.
 */
class CafeSoldOutTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'soldout.test', 'slug' => 'soldout']);
        $this->enableSubmodules($this->tenant->id, ['cafe.menu' => true, 'cafe.pos' => true]);

        $this->cashier = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'cashier',
        ]);
    }

    private function product(array $attributes = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'لاته',
            'slug' => 'latte-'.uniqid(),
            'price_minor' => 200_000,
            'currency' => 'IRT',
            'status' => 'publish',
            'type' => 'simple',
            'is_available' => true,
            'is_sold_out' => false,
        ], $attributes));
    }

    /** The refusal happens in the service, so it applies to every path into an order. */
    public function test_a_sold_out_item_is_refused_when_the_order_is_priced(): void
    {
        $product = $this->product(['is_sold_out' => true]);

        $this->expectException(ValidationException::class);

        app(OrderIntake::class)->create(
            (int) $this->tenant->id,
            [
                'fulfillment' => 'takeaway',
                'items' => [['product_id' => $product->id, 'quantity' => 1]],
            ],
            $this->cashier,
        );
    }

    public function test_an_inactive_item_is_refused(): void
    {
        $product = $this->product(['is_available' => false]);

        $this->expectException(ValidationException::class);

        app(OrderIntake::class)->create(
            (int) $this->tenant->id,
            [
                'fulfillment' => 'takeaway',
                'items' => [['product_id' => $product->id, 'quantity' => 1]],
            ],
            $this->cashier,
        );
    }

    /** An available item still sells: the refusal must not be a blanket block. */
    public function test_an_available_item_still_sells(): void
    {
        $product = $this->product();

        $order = app(OrderIntake::class)->create(
            (int) $this->tenant->id,
            [
                'fulfillment' => 'takeaway',
                'items' => [['product_id' => $product->id, 'quantity' => 1]],
            ],
            $this->cashier,
        );

        $this->assertNotNull($order->id);
    }

    /** The feed tells the cashier why, instead of dropping the item silently. */
    public function test_the_pos_feed_marks_the_reason(): void
    {
        $soldOut = $this->product(['name' => 'تمام‌شده', 'is_sold_out' => true]);
        $inactive = $this->product(['name' => 'غیرفعال', 'is_available' => false]);
        $fine = $this->product(['name' => 'سالم']);

        $this->actingAs($this->cashier, 'sanctum');

        $response = $this->getJson('/api/v1/cafe/pos/bootstrap');
        $response->assertOk();

        $rows = collect($response->json('data.products'))->keyBy('id');

        $this->assertFalse((bool) $rows[$soldOut->id]['available']);
        $this->assertSame('sold_out', $rows[$soldOut->id]['unavailable_reason']);

        $this->assertFalse((bool) $rows[$inactive->id]['available']);
        $this->assertSame('unavailable', $rows[$inactive->id]['unavailable_reason']);

        $this->assertTrue((bool) $rows[$fine->id]['available']);
        $this->assertNull($rows[$fine->id]['unavailable_reason']);
    }

    /** A hidden product is a catalogue decision not to sell it, so it never reaches a till. */
    public function test_a_hidden_product_is_not_in_the_feed(): void
    {
        $hidden = $this->product(['name' => 'پنهان', 'is_hidden' => true]);

        $this->actingAs($this->cashier, 'sanctum');

        $response = $this->getJson('/api/v1/cafe/pos/bootstrap');
        $response->assertOk();

        $ids = collect($response->json('data.products'))->pluck('id')->all();

        $this->assertNotContains($hidden->id, $ids);
    }
}
