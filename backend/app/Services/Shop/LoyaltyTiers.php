<?php

namespace App\Services\Shop;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Tiers and points-as-money.
 *
 * Two questions a loyalty programme has to answer and a flat point balance cannot:
 *
 *  - **What does a point buy?** A point balance with no exchange rate is a number the guest
 *    cannot spend, so nobody tries. `pointValueMinor` is the rate, in the period's own money.
 *  - **Why should a regular care?** A tier is a status the guest can reach; the accrual bonus
 *    is what makes reaching it worth anything.
 *
 * The tier is derived from lifetime earned points, never from the current balance: spending
 * points must not demote somebody who has been coming for three years. That distinction is the
 * whole reason lifetime and balance are tracked separately.
 */
final class LoyaltyTiers
{
    /** The shipped tier ladder. Editable per tenant through the loyalty settings. */
    public static function defaults(): array
    {
        return [
            // `min_points` is lifetime earned, not current balance.
            ['key' => 'bronze', 'label_fa' => 'برنزی', 'label_en' => 'Bronze', 'min_points' => 0, 'accrual_percent' => 0],
            ['key' => 'silver', 'label_fa' => 'نقره‌ای', 'label_en' => 'Silver', 'min_points' => 5000, 'accrual_percent' => 10],
            ['key' => 'gold', 'label_fa' => 'طلایی', 'label_en' => 'Gold', 'min_points' => 20000, 'accrual_percent' => 20],
        ];
    }

    /** @return list<array<string, mixed>> */
    public function tiers(int $tenantId): array
    {
        $stored = ShopSettings::getLoyalty($tenantId)['tiers'] ?? null;

        return is_array($stored) && $stored !== [] ? $stored : self::defaults();
    }

    /** Lifetime points earned — the sum of positive ledger rows, not the current balance. */
    public function lifetimeEarned(int $tenantId, int $userId): int
    {
        return (int) DB::table('loyalty_ledger')
            ->where('tenant_id', $tenantId)
            ->where('user_id', $userId)
            ->where('points', '>', 0)
            ->sum('points');
    }

    /**
     * The tier a guest is in, plus how far the next one is.
     *
     * @return array{key: string, label_fa: string, label_en: string, accrual_percent: float, lifetime_points: int, next: array{key: string, remaining: int}|null}
     */
    public function forUser(int $tenantId, int $userId): array
    {
        $lifetime = $this->lifetimeEarned($tenantId, $userId);
        $tiers = $this->tiers($tenantId);

        // Highest threshold reached. Tiers are sorted defensively: a settings screen that saves
        // them out of order must not change who is gold.
        usort($tiers, fn ($a, $b) => (int) $a['min_points'] <=> (int) $b['min_points']);

        $current = $tiers[0];
        $next = null;

        foreach ($tiers as $index => $tier) {
            if ($lifetime >= (int) $tier['min_points']) {
                $current = $tier;
                $next = $tiers[$index + 1] ?? null;
            }
        }

        return [
            'key' => (string) $current['key'],
            'label_fa' => (string) ($current['label_fa'] ?? $current['key']),
            'label_en' => (string) ($current['label_en'] ?? $current['key']),
            'accrual_percent' => (float) ($current['accrual_percent'] ?? 0),
            'lifetime_points' => $lifetime,
            'next' => $next === null ? null : [
                'key' => (string) $next['key'],
                'remaining' => max(0, (int) $next['min_points'] - $lifetime),
            ],
        ];
    }

    /** Extra points a tier's accrual bonus earns on a base award. */
    public function bonus(int $tenantId, int $userId, int $basePoints): int
    {
        if ($basePoints <= 0) {
            return 0;
        }

        $percent = $this->forUser($tenantId, $userId)['accrual_percent'];

        return (int) floor($basePoints * ($percent / 100));
    }

    /**
     * What a point count is worth in money.
     *
     * `point_price_minor` is how much spend earns a point; `point_value_minor` is what a point
     * is worth when spent. They are deliberately separate numbers: a programme that earns at
     * 1% and redeems at 1% gives away the entire margin.
     */
    public function pointValueMinor(int $tenantId): int
    {
        $value = ShopSettings::getLoyalty($tenantId)['point_value_minor'] ?? null;

        return max(0, (int) ($value ?? 100));
    }

    /**
     * The money value of a points redemption, capped at a share of the bill.
     *
     * The cap is not a technicality: without it a guest with a large balance can take the whole
     * order to zero, which turns a loyalty scheme into an unlimited discount.
     *
     * @return array{points: int, value_minor: int, capped: bool}
     */
    public function redemption(int $tenantId, int $points, int $billMinor): array
    {
        $settings = ShopSettings::getLoyalty($tenantId);
        $points = max(0, $points);

        $value = $points * $this->pointValueMinor($tenantId);

        $maxShare = max(0, min(100, (int) ($settings['max_redeem_percent'] ?? 50)));
        $cap = (int) floor($billMinor * ($maxShare / 100));

        if ($value > $cap) {
            $perPoint = max(1, $this->pointValueMinor($tenantId));

            return [
                'points' => (int) floor($cap / $perPoint),
                'value_minor' => min($value, $cap),
                'capped' => true,
            ];
        }

        return ['points' => $points, 'value_minor' => $value, 'capped' => false];
    }

    /** A user's balance and standing, for the guest-facing account screen. */
    public function summary(User $user): array
    {
        $tenantId = (int) $user->tenant_id;
        $tier = $this->forUser($tenantId, (int) $user->id);

        return [
            'balance' => (int) $user->loyalty_points,
            'point_value_minor' => $this->pointValueMinor($tenantId),
            'tier' => $tier,
        ];
    }
}
