<?php

namespace Tests\Feature;

use App\Models\LoyaltyLedger;
use App\Models\User;
use App\Services\Shop\LoyaltyTiers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Tiers and points-as-money.
 *
 * The bug this replaces was quiet and expensive: a point was redeemed at the rate it was
 * *earned*, so a guest spending their balance took back the entire margin, and nothing capped
 * how much of a bill a balance could consume.
 */
class LoyaltyTiersTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $guest;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'tiers.test', 'slug' => 'tiers']);
        $this->enableSubmodules($this->tenant->id, ['shop.loyalty' => true]);

        // Module settings are cached for 60s; a test that writes one must not read another
        // test's value.
        \Illuminate\Support\Facades\Cache::flush();

        $this->guest = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'customer',
            'loyalty_points' => 0,
        ]);

        $this->actingAs($this->guest, 'sanctum');
    }

    private function earn(int $points): void
    {
        LoyaltyLedger::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->guest->id,
            'points' => $points,
            'reason' => 'order_paid',
        ]);
    }

    /** Lifetime earned decides the tier, so spending does not demote anyone. */
    public function test_the_tier_follows_lifetime_earned_not_the_current_balance(): void
    {
        $this->earn(6000);

        // Spend everything: the balance is zero but the guest has been coming for years.
        LoyaltyLedger::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->guest->id,
            'points' => -6000,
            'reason' => 'redeem_at_till',
        ]);

        $tier = app(LoyaltyTiers::class)->forUser($this->tenant->id, $this->guest->id);

        $this->assertSame('silver', $tier['key']);
        $this->assertSame(6000, $tier['lifetime_points']);
    }

    /** The next tier and the distance to it are both reported. */
    public function test_the_next_tier_reports_how_far_away_it_is(): void
    {
        $this->earn(4000);

        $tier = app(LoyaltyTiers::class)->forUser($this->tenant->id, $this->guest->id);

        $this->assertSame('bronze', $tier['key']);
        $this->assertSame('silver', $tier['next']['key']);
        $this->assertSame(1000, $tier['next']['remaining']);
    }

    /** A tier that starts at zero means a brand-new guest is already in it, not "no tier". */
    public function test_a_new_guest_is_in_the_first_tier(): void
    {
        $tier = app(LoyaltyTiers::class)->forUser($this->tenant->id, $this->guest->id);

        $this->assertSame('bronze', $tier['key']);
        $this->assertSame(0, $tier['lifetime_points']);
    }

    /** The accrual bonus is a percentage of the base award at the guest's tier. */
    public function test_the_tier_accrual_bonus_applies_to_each_award(): void
    {
        $this->earn(6000); // silver: 10%

        $this->assertSame(10, app(LoyaltyTiers::class)->bonus($this->tenant->id, $this->guest->id, 100));
        $this->assertSame(0, app(LoyaltyTiers::class)->bonus($this->tenant->id, $this->guest->id, 0));
    }

    /**
     * Redemption uses the point's value, not the earning rate.
     *
     * Earning is 1 point per 1,000 toman and a point is worth 100: 10,000 points on a 2,000,000
     * bill is 1,000,000 of value, well under the 50% cap of 1,000,000 — so it goes through whole.
     */
    public function test_redemption_uses_the_configured_point_value(): void
    {
        $tiers = app(LoyaltyTiers::class);

        $result = $tiers->redemption($this->tenant->id, 10_000, 2_000_000);

        $this->assertSame(10_000, $result['points']);
        $this->assertSame(1_000_000, $result['value_minor']);
        $this->assertFalse($result['capped']);
    }

    /** Without the cap a large balance zeroes the bill; the cap makes it a partial discount. */
    public function test_redemption_is_capped_at_a_share_of_the_bill(): void
    {
        $tiers = app(LoyaltyTiers::class);

        // 100,000 points × 100 = 10,000,000 of value against a 1,000,000 bill.
        $result = $tiers->redemption($this->tenant->id, 100_000, 1_000_000);

        $this->assertTrue($result['capped']);
        $this->assertSame(500_000, $result['value_minor'], 'the default cap is half the bill');
        $this->assertSame(5_000, $result['points'], 'only the points needed for the cap are spent');
    }

    /** A zero-value programme cannot silently eat points. */
    public function test_points_with_no_configured_value_are_worth_nothing(): void
    {
        app(\App\Services\Modules\ModuleSettingsService::class)->put($this->tenant->id, 'shop', 'loyalty', [
            'enabled' => true,
            'point_value_minor' => 0,
            'max_redeem_percent' => 50,
        ]);

        $result = app(LoyaltyTiers::class)->redemption($this->tenant->id, 1000, 500_000);

        $this->assertSame(0, $result['value_minor']);
    }

    /** The guest-facing balance endpoint now carries the value and the tier. */
    public function test_the_balance_endpoint_reports_value_and_tier(): void
    {
        $this->earn(6000);
        $this->guest->forceFill(['loyalty_points' => 6000])->save();

        $data = $this->getJson('/api/v1/loyalty/balance')->assertOk()->json('data');

        $this->assertSame(6000, $data['points']);
        $this->assertSame('silver', $data['tier']['key']);
        $this->assertSame(100, $data['point_value_minor']);
    }
}
