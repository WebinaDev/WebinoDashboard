<?php

namespace Tests\Feature;

use Illuminate\Validation\ValidationException;

class OfferEngineTest extends CouponOffersTest
{
    private function line($p, int $qty, int $price): array
    {
        return ['product_id' => $p->id, 'quantity' => $qty, 'unit_price_minor' => $price];
    }

    public function test_bogo_discounts_cheapest_units_per_group(): void
    {
        $a = $this->product();
        $b = $this->product();
        $c = $this->coupon(['type' => 'bogo', 'amount' => 0, 'restrictions' => ['offer' => ['buy' => 2, 'get' => 1]]]);
        $lines = [$this->line($a, 2, 30000), $this->line($b, 1, 10000)];
        $res = $this->service()->apply($this->tenant->id, $c->code, 70000, $lines, $this->user->id);
        $this->assertSame(10000, $res['discount_minor']);

        $this->expectException(ValidationException::class);
        $this->service()->apply($this->tenant->id, $c->code, 30000, [$this->line($a, 2, 15000)], $this->user->id);
    }

    public function test_bundle_requires_all_products_and_counts_sets(): void
    {
        $a = $this->product();
        $b = $this->product();
        $c = $this->coupon(['type' => 'bundle', 'amount' => 20, 'restrictions' => ['product_ids' => [$a->id, $b->id]]]);
        $res = $this->service()->apply($this->tenant->id, $c->code, 60000, [$this->line($a, 2, 20000), $this->line($b, 2, 10000)], $this->user->id);
        $this->assertSame(12000, $res['discount_minor']); // 2 sets × 20% of 30000

        $this->expectException(ValidationException::class);
        $this->service()->apply($this->tenant->id, $c->code, 20000, [$this->line($a, 1, 20000)], $this->user->id);
    }

    public function test_tiered_picks_highest_reached_tier(): void
    {
        $a = $this->product();
        $c = $this->coupon(['type' => 'tiered', 'amount' => 0, 'restrictions' => ['offer' => ['tiers' => [
            ['min_qty' => 2, 'percent' => 5], ['min_qty' => 4, 'percent' => 10],
        ]]]]);
        $res = $this->service()->apply($this->tenant->id, $c->code, 50000, [$this->line($a, 5, 10000)], $this->user->id);
        $this->assertSame(5000, $res['discount_minor']);
    }
}
