<?php

namespace App\Services\Shop;

use App\Models\Coupon;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltyReward;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\Coupons\CouponService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class LoyaltyService
{
    public function __construct(private readonly CouponService $coupons) {}

    public function awardForPaidOrder(Order $order): void
    {
        $settings = ShopSettings::getLoyalty((int) $order->tenant_id);
        if (empty($settings['enabled']) || ! $order->user_id) {
            return;
        }

        $exists = LoyaltyLedger::query()
            ->where('order_id', $order->id)
            ->where('points', '>', 0)
            ->exists();
        if ($exists) {
            return;
        }

        $price = max(1, (int) $settings['point_price_minor']);
        $maxPerProduct = max(0, (int) $settings['max_points_per_product']);
        $items = OrderItem::query()->where('order_id', $order->id)->get();
        $points = 0;
        foreach ($items as $item) {
            $line = (int) $item->unit_price_minor * (int) $item->quantity;
            $earned = (int) floor($line / $price);
            if ($maxPerProduct > 0) {
                $earned = min($earned, $maxPerProduct * (int) $item->quantity);
            }
            $points += $earned;
        }
        if ($points <= 0) {
            return;
        }

        DB::transaction(function () use ($order, $points) {
            LoyaltyLedger::query()->create([
                'tenant_id' => $order->tenant_id,
                'user_id' => $order->user_id,
                'order_id' => $order->id,
                'points' => $points,
                'reason' => 'order_paid',
            ]);
            User::query()->where('id', $order->user_id)->increment('loyalty_points', $points);
        });
    }

    public function awardWelcome(User $user): int
    {
        $settings = ShopSettings::getLoyalty((int) $user->tenant_id);
        $points = (int) ($settings['welcome_points'] ?? 0);
        if (empty($settings['enabled']) || $points <= 0) {
            return 0;
        }
        $exists = LoyaltyLedger::query()
            ->where('user_id', $user->id)
            ->where('reason', 'welcome')
            ->exists();
        if ($exists) {
            return 0;
        }

        return $this->grant($user, $points, 'welcome');
    }

    public function awardReferral(User $referrer, User $referred): int
    {
        if ((int) $referrer->tenant_id !== (int) $referred->tenant_id || $referrer->id === $referred->id) {
            return 0;
        }
        $settings = ShopSettings::getLoyalty((int) $referrer->tenant_id);
        $points = (int) ($settings['referral_points'] ?? 0);
        if (empty($settings['enabled']) || $points <= 0) {
            return 0;
        }
        $reason = 'referral:'.$referred->id;
        $exists = LoyaltyLedger::query()
            ->where('tenant_id', $referrer->tenant_id)
            ->where('reason', $reason)
            ->exists();
        if ($exists) {
            return 0;
        }

        return $this->grant($referrer, $points, $reason);
    }

    private function grant(User $user, int $points, string $reason): int
    {
        DB::transaction(function () use ($user, $points, $reason) {
            LoyaltyLedger::query()->create([
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'points' => $points,
                'reason' => $reason,
            ]);
            User::query()->where('id', $user->id)->increment('loyalty_points', $points);
        });

        return $points;
    }

    /**
     * @return array{coupon_code: string, points_spent: int, balance: int}
     */
    public function redeem(int $tenantId, User $user, int $rewardId): array
    {
        $settings = ShopSettings::getLoyalty($tenantId);
        if (empty($settings['enabled'])) {
            throw ValidationException::withMessages(['loyalty' => 'Loyalty disabled']);
        }

        $reward = LoyaltyReward::query()
            ->where('tenant_id', $tenantId)
            ->where('id', $rewardId)
            ->where('is_active', true)
            ->firstOrFail();

        if ((int) $user->loyalty_points < (int) $reward->points_cost) {
            throw ValidationException::withMessages(['points' => 'Insufficient points']);
        }

        return DB::transaction(function () use ($tenantId, $user, $reward) {
            $code = $this->coupons->generateCode($tenantId, 10);
            $expires = $reward->validity_days
                ? now()->addDays((int) $reward->validity_days)
                : null;

            Coupon::query()->create([
                'tenant_id' => $tenantId,
                'code' => $code,
                'type' => $reward->discount_type === 'fixed' ? 'fixed' : 'percent',
                'amount' => (int) $reward->discount_amount,
                'min_spend_minor' => $reward->min_cart_minor,
                'usage_limit' => 1,
                'usage_limit_per_user' => 1,
                'expires_at' => $expires,
                'status' => 'publish',
                'description' => 'Loyalty: '.$reward->title,
                'restrictions' => [
                    'product_ids' => $reward->product_ids ?? [],
                    'category_ids' => $reward->category_ids ?? [],
                    'email' => $user->email,
                ],
            ]);

            LoyaltyLedger::query()->create([
                'tenant_id' => $tenantId,
                'user_id' => $user->id,
                'loyalty_reward_id' => $reward->id,
                'points' => -1 * (int) $reward->points_cost,
                'reason' => 'redeem',
                'coupon_code' => $code,
            ]);
            $user->decrement('loyalty_points', (int) $reward->points_cost);

            return [
                'coupon_code' => $code,
                'points_spent' => (int) $reward->points_cost,
                'balance' => (int) $user->fresh()->loyalty_points,
            ];
        });
    }

    public static function makeUid(): string
    {
        return 'rvd_'.Str::lower(Str::random(9));
    }
}
