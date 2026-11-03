<?php

namespace App\Services\Shop;

use App\Models\Coupon;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltyMission;
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
        if (! $exists) {
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
            if ($points > 0) {
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
        }

        $this->evaluateOrderMissions($order);
    }

    public function awardWelcome(User $user): int
    {
        $settings = ShopSettings::getLoyalty((int) $user->tenant_id);
        if (empty($settings['enabled'])) {
            return 0;
        }
        $mission = $this->activeMission((int) $user->tenant_id, 'welcome');
        $points = $mission ? (int) $mission->points : (int) ($settings['welcome_points'] ?? 0);
        if ($points <= 0) {
            return 0;
        }
        $reason = $mission ? 'mission:'.$mission->id.':welcome' : 'welcome';
        $exists = LoyaltyLedger::query()
            ->where('user_id', $user->id)
            ->where(function ($q) use ($reason, $mission) {
                $q->where('reason', 'welcome');
                if ($mission) {
                    $q->orWhere('reason', $reason);
                }
            })
            ->exists();
        if ($exists) {
            return 0;
        }

        return $this->grant($user, $points, $reason);
    }

    public function awardReferral(User $referrer, User $referred): int
    {
        if ((int) $referrer->tenant_id !== (int) $referred->tenant_id || $referrer->id === $referred->id) {
            return 0;
        }
        $settings = ShopSettings::getLoyalty((int) $referrer->tenant_id);
        if (empty($settings['enabled'])) {
            return 0;
        }
        $mission = $this->activeMission((int) $referrer->tenant_id, 'referral');
        $points = $mission ? (int) $mission->points : (int) ($settings['referral_points'] ?? 0);
        if ($points <= 0) {
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

    /**
     * After a paid order, grant first_order / order_count / order_amount missions when thresholds match.
     */
    public function evaluateOrderMissions(Order $order): void
    {
        if (! $order->user_id) {
            return;
        }
        $settings = ShopSettings::getLoyalty((int) $order->tenant_id);
        if (empty($settings['enabled'])) {
            return;
        }
        $user = User::query()->find($order->user_id);
        if (! $user) {
            return;
        }
        $tid = (int) $order->tenant_id;
        $paidCount = Order::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $user->id)
            ->whereIn('status', ['paid', 'processing', 'completed', 'shipped', 'delivered'])
            ->count();
        $paidTotal = (int) Order::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $user->id)
            ->whereIn('status', ['paid', 'processing', 'completed', 'shipped', 'delivered'])
            ->sum('total_minor');

        $missions = LoyaltyMission::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->whereIn('type', ['first_order', 'order_count', 'order_amount'])
            ->orderBy('sort_order')
            ->get();

        foreach ($missions as $mission) {
            $reason = 'mission:'.$mission->id;
            if (LoyaltyLedger::query()->where('user_id', $user->id)->where('reason', $reason)->exists()) {
                continue;
            }
            $cfg = is_array($mission->config) ? $mission->config : [];
            $ok = match ($mission->type) {
                'first_order' => $paidCount === 1,
                'order_count' => $paidCount >= max(1, (int) ($cfg['target_count'] ?? 2)),
                'order_amount' => $paidTotal >= max(1, (int) ($cfg['target_amount_minor'] ?? 1)),
                default => false,
            };
            if ($ok && (int) $mission->points > 0) {
                $this->grant($user, (int) $mission->points, $reason);
            }
        }
    }

    /**
     * @return array{points: int, balance: int, reason: string}
     */
    public function claimMission(int $tenantId, User $user, int $missionId, ?string $code = null): array
    {
        $settings = ShopSettings::getLoyalty($tenantId);
        if (empty($settings['enabled'])) {
            throw ValidationException::withMessages(['loyalty' => 'Loyalty disabled']);
        }
        $mission = LoyaltyMission::query()
            ->where('tenant_id', $tenantId)
            ->where('id', $missionId)
            ->where('is_active', true)
            ->firstOrFail();

        $claimable = ['daily_checkin', 'birthday', 'custom', 'review'];
        if (! in_array($mission->type, $claimable, true)) {
            throw ValidationException::withMessages(['mission' => 'This mission is awarded automatically.']);
        }

        $cfg = is_array($mission->config) ? $mission->config : [];
        if ($mission->type === 'custom' && ! empty($cfg['code'])) {
            if (! hash_equals((string) $cfg['code'], (string) ($code ?? ''))) {
                throw ValidationException::withMessages(['code' => 'Invalid mission code.']);
            }
        }

        $reasonBase = 'mission:'.$mission->id;
        if ($mission->type === 'daily_checkin') {
            $cooldown = max(1, (int) ($cfg['cooldown_hours'] ?? 24));
            $recent = LoyaltyLedger::query()
                ->where('user_id', $user->id)
                ->where('reason', 'like', $reasonBase.'%')
                ->where('created_at', '>=', now()->subHours($cooldown))
                ->exists();
            if ($recent) {
                throw ValidationException::withMessages(['mission' => 'Daily mission already claimed.']);
            }
            $reason = $reasonBase.':'.now()->toDateString();
        } elseif ($mission->type === 'birthday') {
            $reason = $reasonBase.':'.now()->year;
            if (LoyaltyLedger::query()->where('user_id', $user->id)->where('reason', $reason)->exists()) {
                throw ValidationException::withMessages(['mission' => 'Birthday mission already claimed this year.']);
            }
        } else {
            $reason = $reasonBase;
            if ($mission->type !== 'custom' && LoyaltyLedger::query()->where('user_id', $user->id)->where('reason', $reason)->exists()) {
                throw ValidationException::withMessages(['mission' => 'Mission already completed.']);
            }
            if ($mission->type === 'custom') {
                $cooldown = (int) ($cfg['cooldown_hours'] ?? 0);
                if ($cooldown > 0) {
                    $recent = LoyaltyLedger::query()
                        ->where('user_id', $user->id)
                        ->where('reason', 'like', $reasonBase.'%')
                        ->where('created_at', '>=', now()->subHours($cooldown))
                        ->exists();
                    if ($recent) {
                        throw ValidationException::withMessages(['mission' => 'Mission cooldown active.']);
                    }
                    $reason = $reasonBase.':'.now()->timestamp;
                } elseif (LoyaltyLedger::query()->where('user_id', $user->id)->where('reason', $reason)->exists()) {
                    throw ValidationException::withMessages(['mission' => 'Mission already completed.']);
                }
            }
        }

        $points = max(0, (int) $mission->points);
        if ($points <= 0) {
            throw ValidationException::withMessages(['points' => 'Mission has no points.']);
        }
        $this->grant($user, $points, $reason);

        return [
            'points' => $points,
            'balance' => (int) $user->fresh()->loyalty_points,
            'reason' => $reason,
        ];
    }

    public function dailyCheckinPoints(int $tenantId): int
    {
        $mission = $this->activeMission($tenantId, 'daily_checkin');
        if ($mission) {
            return (int) $mission->points;
        }
        $settings = ShopSettings::getLoyalty($tenantId);

        return max(0, (int) ($settings['daily_points'] ?? 0));
    }

    private function activeMission(int $tenantId, string $type): ?LoyaltyMission
    {
        return LoyaltyMission::query()
            ->where('tenant_id', $tenantId)
            ->where('type', $type)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->first();
    }

    public function grant(User $user, int $points, string $reason): int
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
