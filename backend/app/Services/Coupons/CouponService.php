<?php

namespace App\Services\Coupons;

use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Models\Order;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CouponService
{
    public function generateCode(int $tenantId, int $length = 8): string
    {
        do {
            $code = strtoupper(Str::random($length));
        } while (Coupon::query()->where('tenant_id', $tenantId)->where('code', $code)->exists());

        return $code;
    }

    /**
     * @param  list<array{product_id?: int, unit_price_minor: int, quantity: int}>  $lines
     * @return array{discount_minor: int, coupon: Coupon}
     */
    public function apply(int $tenantId, string $code, int $subtotalMinor, array $lines = [], ?int $userId = null, string $channel = 'site'): array
    {
        $coupon = Coupon::query()
            ->where('tenant_id', $tenantId)
            ->where('code', strtoupper(trim($code)))
            ->where('status', 'publish')
            ->first();

        if (! $coupon) {
            throw ValidationException::withMessages(['coupon_code' => 'Invalid coupon']);
        }

        if ($coupon->expires_at && $coupon->expires_at->isPast()) {
            throw ValidationException::withMessages(['coupon_code' => 'Coupon expired']);
        }

        if ($coupon->usage_limit !== null && $coupon->usage_count >= $coupon->usage_limit) {
            throw ValidationException::withMessages(['coupon_code' => 'Coupon usage limit reached']);
        }

        if ($userId && $coupon->usage_limit_per_user !== null) {
            $used = CouponRedemption::query()
                ->where('coupon_id', $coupon->id)
                ->where('user_id', $userId)
                ->count();
            if ($used >= $coupon->usage_limit_per_user) {
                throw ValidationException::withMessages(['coupon_code' => 'Per-user limit reached']);
            }
        }

        if ($coupon->min_spend_minor !== null && $subtotalMinor < $coupon->min_spend_minor) {
            throw ValidationException::withMessages(['coupon_code' => 'Below minimum spend']);
        }
        if ($coupon->max_spend_minor !== null && $subtotalMinor > $coupon->max_spend_minor) {
            throw ValidationException::withMessages(['coupon_code' => 'Above maximum spend']);
        }

        $r = $coupon->restrictions ?? [];
        $channels = $r['channels'] ?? null;
        if (is_array($channels) && count($channels) > 0 && ! in_array($channel, $channels, true)) {
            throw ValidationException::withMessages(['coupon_code' => 'Coupon not valid for this channel']);
        }

        if (! empty($r['user_ids']) && $userId && ! in_array($userId, $r['user_ids'], true)) {
            throw ValidationException::withMessages(['coupon_code' => 'Coupon not allowed for user']);
        }

        $eligible = $subtotalMinor;
        if ($coupon->type === 'fixed_product' && ! empty($r['product_ids'])) {
            $eligible = 0;
            foreach ($lines as $line) {
                if (in_array((int) ($line['product_id'] ?? 0), $r['product_ids'], true)) {
                    $eligible += (int) $line['unit_price_minor'] * (int) $line['quantity'];
                }
            }
        }

        $discount = match ($coupon->type) {
            'percent' => (int) floor($eligible * ((int) $coupon->amount) / 100),
            'fixed_cart', 'fixed_product' => min((int) $coupon->amount, $eligible),
            default => 0,
        };

        return ['discount_minor' => max(0, $discount), 'coupon' => $coupon];
    }

    public function redeem(Coupon $coupon, Order $order, int $discountMinor, ?int $userId = null): void
    {
        CouponRedemption::query()->create([
            'tenant_id' => $coupon->tenant_id,
            'coupon_id' => $coupon->id,
            'user_id' => $userId,
            'order_id' => $order->id,
            'discount_minor' => $discountMinor,
        ]);
        $coupon->increment('usage_count');
    }
}
