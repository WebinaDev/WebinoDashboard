<?php

namespace App\Services\Coupons;

use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\Reports\OrderReports;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CouponService
{
    /** @deprecated Use {@see OrderReports::salesStatuses()}. */
    public const PAID_ORDER_STATUSES = ['paid', 'processing', 'shipped', 'completed'];

    public function generateCode(int $tenantId, int $length = 8): string
    {
        do {
            $code = strtoupper(Str::random($length));
        } while (Coupon::query()->where('tenant_id', $tenantId)->where('code', $code)->exists());

        return $code;
    }

    /**
     * @param  list<array{product_id?: int|null, unit_price_minor: int, quantity: int}>  $lines
     * @param  list<string>  $otherCodes
     * @return array{discount_minor: int, coupon: Coupon, free_shipping: bool, shipping_percent: int, individual_use: bool}
     */
    public function apply(int $tenantId, string $code, int $subtotalMinor, array $lines = [], ?int $userId = null, string $channel = 'site', array $otherCodes = [], ?string $password = null): array
    {
        $coupon = Coupon::query()
            ->where('tenant_id', $tenantId)
            ->where('code', strtoupper(trim($code)))
            ->where('status', 'publish')
            ->first();

        if (! $coupon) {
            throw ValidationException::withMessages(['coupon_code' => 'Invalid coupon']);
        }

        $others = array_values(array_diff(array_map(fn ($c) => strtoupper(trim((string) $c)), $otherCodes), [$coupon->code, '']));
        if ($others !== []) {
            $blocked = $coupon->individual_use || Coupon::query()
                ->where('tenant_id', $tenantId)
                ->whereIn('code', $others)
                ->where('individual_use', true)
                ->exists();
            if ($blocked) {
                throw ValidationException::withMessages(['coupon_code' => 'Coupon cannot be combined with other coupons']);
            }
        }

        return $this->evaluate($coupon, $subtotalMinor, $lines, $userId, $channel, $password);
    }

    /**
     * @param  list<array{product_id?: int|null, unit_price_minor: int, quantity: int}>  $lines
     * @return array{discount_minor: int, coupon: Coupon, free_shipping: bool, shipping_percent: int, individual_use: bool}|null
     */
    public function bestAutoApply(int $tenantId, int $subtotalMinor, array $lines = [], ?int $userId = null, string $channel = 'site'): ?array
    {
        $candidates = Coupon::query()
            ->where('tenant_id', $tenantId)
            ->where('auto_apply', true)
            ->where('status', 'publish')
            ->where(function ($q) {
                $q->whereNull('visibility')->orWhere('visibility', '!=', 'password');
            })
            ->orderBy('id')
            ->get();

        $best = null;
        $bestScore = null;
        foreach ($candidates as $coupon) {
            try {
                $result = $this->evaluate($coupon, $subtotalMinor, $lines, $userId, $channel);
            } catch (ValidationException) {
                continue;
            }
            $score = [$result['discount_minor'], $result['free_shipping'] ? 100 : $result['shipping_percent']];
            if ($score === [0, 0]) {
                continue;
            }
            if ($bestScore === null || ($score <=> $bestScore) > 0) {
                $best = $result;
                $bestScore = $score;
            }
        }

        return $best;
    }

    /**
     * @param  array{free_shipping?: bool, shipping_percent?: int}  $applied
     */
    public function shippingAfter(array $applied, int $shippingMinor): int
    {
        if (! empty($applied['free_shipping'])) {
            return 0;
        }
        $percent = min(100, max(0, (int) ($applied['shipping_percent'] ?? 0)));
        if ($percent > 0) {
            return max(0, $shippingMinor - (int) floor($shippingMinor * $percent / 100));
        }

        return $shippingMinor;
    }

    /**
     * @param  list<array{product_id?: int|null, unit_price_minor: int, quantity: int}>  $lines
     * @return array{discount_minor: int, coupon: Coupon, free_shipping: bool, shipping_percent: int, individual_use: bool}
     */
    public function evaluate(Coupon $coupon, int $subtotalMinor, array $lines = [], ?int $userId = null, string $channel = 'site', ?string $password = null): array
    {
        if ($coupon->scheduled_at && $coupon->scheduled_at->isFuture()) {
            throw ValidationException::withMessages(['coupon_code' => 'Coupon is not active yet']);
        }

        if ($coupon->expires_at && $coupon->expires_at->isPast()) {
            throw ValidationException::withMessages(['coupon_code' => 'Coupon expired']);
        }

        if ((string) $coupon->visibility === 'password') {
            $expected = (string) ($coupon->password ?? '');
            $given = (string) ($password ?? '');
            if ($expected === '' || ! hash_equals($expected, $given)) {
                throw ValidationException::withMessages(['coupon_password' => 'Coupon password is required']);
            }
        }

        $reserved = CouponRedemption::query()->where('coupon_id', $coupon->id)->count();
        $usedCount = max((int) $coupon->usage_count, $reserved);
        if ($coupon->usage_limit !== null && $usedCount >= $coupon->usage_limit) {
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

        $userIds = $this->ids($r['user_ids'] ?? []);
        if ($userIds !== [] && (! $userId || ! in_array($userId, $userIds, true))) {
            throw ValidationException::withMessages(['coupon_code' => 'Coupon not allowed for user']);
        }

        $emails = array_values(array_filter(array_map(fn ($e) => strtolower(trim((string) $e)), (array) ($r['emails'] ?? []))));
        if ($emails !== []) {
            $email = $userId ? strtolower(trim((string) User::query()->whereKey($userId)->value('email'))) : '';
            $allowed = $email !== '' && collect($emails)->contains(fn ($pattern) => Str::is($pattern, $email));
            if (! $allowed) {
                throw ValidationException::withMessages(['coupon_code' => 'Coupon not allowed for this email']);
            }
        }

        $this->assertCondition($coupon, $subtotalMinor, $lines, $userId);

        $eligible = $this->eligibleSubtotal($coupon, $subtotalMinor, $lines);

        $discount = match ($coupon->type) {
            'percent' => (int) floor($eligible * ((int) $coupon->amount) / 100),
            'fixed_cart', 'fixed_product' => min((int) $coupon->amount, $eligible),
            default => 0,
        };
        if ($coupon->max_discount_minor !== null) {
            $discount = min($discount, (int) $coupon->max_discount_minor);
        }

        return [
            'discount_minor' => max(0, $discount),
            'coupon' => $coupon,
            'free_shipping' => (bool) $coupon->free_shipping,
            'shipping_percent' => min(100, max(0, (int) ($coupon->shipping_percent ?? 0))),
            'individual_use' => (bool) $coupon->individual_use,
        ];
    }

    public function redeem(Coupon $coupon, Order $order, int $discountMinor, ?int $userId = null): void
    {
        $this->hold($coupon, $order, $discountMinor, $userId);
        if (in_array((string) $order->status, OrderReports::salesStatuses(), true)) {
            $this->consumeHeld($order);
        }
    }

    /**
     * Reserve a usage slot at checkout. The counter moves only when the order is paid or confirmed.
     */
    public function hold(Coupon $coupon, Order $order, int $discountMinor, ?int $userId = null): void
    {
        \Illuminate\Support\Facades\DB::transaction(function () use ($coupon, $order, $discountMinor, $userId) {
            if (CouponRedemption::query()->where('order_id', $order->id)->exists()) {
                return;
            }
            $locked = Coupon::query()->whereKey($coupon->id)->lockForUpdate()->firstOrFail();
            $active = CouponRedemption::query()->where('coupon_id', $locked->id)->count();
            if ($locked->usage_limit !== null && $active >= $locked->usage_limit) {
                throw ValidationException::withMessages(['coupon_code' => 'Coupon usage limit reached']);
            }
            if ($userId && $locked->usage_limit_per_user !== null) {
                $used = CouponRedemption::query()
                    ->where('coupon_id', $locked->id)
                    ->where('user_id', $userId)
                    ->count();
                if ($used >= $locked->usage_limit_per_user) {
                    throw ValidationException::withMessages(['coupon_code' => 'Per-user limit reached']);
                }
            }
            CouponRedemption::query()->create([
                'tenant_id' => $locked->tenant_id,
                'coupon_id' => $locked->id,
                'user_id' => $userId,
                'order_id' => $order->id,
                'discount_minor' => $discountMinor,
            ]);
        });
    }

    public function consumeHeld(Order $order): void
    {
        if (! $order->coupon_id) {
            return;
        }
        $meta = is_array($order->meta) ? $order->meta : [];
        if (! empty($meta['coupon_consumed'])) {
            return;
        }
        \Illuminate\Support\Facades\DB::transaction(function () use ($order) {
            $fresh = Order::query()->whereKey($order->id)->lockForUpdate()->first();
            if (! $fresh || ! $fresh->coupon_id) {
                return;
            }
            $meta = is_array($fresh->meta) ? $fresh->meta : [];
            if (! empty($meta['coupon_consumed'])) {
                return;
            }
            $coupon = Coupon::query()->whereKey($fresh->coupon_id)->lockForUpdate()->first();
            if (! $coupon) {
                return;
            }
            if (! CouponRedemption::query()->where('order_id', $fresh->id)->exists()) {
                $active = CouponRedemption::query()->where('coupon_id', $coupon->id)->count();
                if ($coupon->usage_limit !== null && $active >= $coupon->usage_limit) {
                    throw ValidationException::withMessages(['coupon_code' => 'Coupon usage limit reached']);
                }
                CouponRedemption::query()->create([
                    'tenant_id' => $coupon->tenant_id,
                    'coupon_id' => $coupon->id,
                    'user_id' => $fresh->user_id,
                    'order_id' => $fresh->id,
                    'discount_minor' => (int) $fresh->discount_minor,
                ]);
            }
            $coupon->increment('usage_count');
            $meta['coupon_consumed'] = true;
            $fresh->meta = $meta;
            $fresh->saveQuietly();
        });
    }

    public function syncOrder(Order $order, ?string $from, string $to): void
    {
        if (! $order->coupon_id) {
            return;
        }
        $sales = OrderReports::salesStatuses();
        $was = $from !== null && in_array($from, $sales, true);
        $now = in_array($to, $sales, true);
        $meta = is_array($order->meta) ? $order->meta : [];
        $consumed = ! empty($meta['coupon_consumed']);
        if ($now && ! $consumed) {
            $this->consumeHeld($order);

            return;
        }
        if (! $now && in_array($to, ['cancelled', 'failed', 'payment_failed'], true)) {
            $this->release($order, $consumed || $was);
        }
    }

    public function release(Order $order, bool $decrement): void
    {
        \Illuminate\Support\Facades\DB::transaction(function () use ($order, $decrement) {
            $fresh = Order::query()->whereKey($order->id)->lockForUpdate()->first();
            if (! $fresh) {
                return;
            }
            $redemption = CouponRedemption::query()->where('order_id', $fresh->id)->first();
            if ($decrement && $fresh->coupon_id) {
                $coupon = Coupon::query()->whereKey($fresh->coupon_id)->lockForUpdate()->first();
                $meta = is_array($fresh->meta) ? $fresh->meta : [];
                if ($coupon && ! empty($meta['coupon_consumed']) && (int) $coupon->usage_count > 0) {
                    $coupon->decrement('usage_count');
                }
                unset($meta['coupon_consumed']);
                $fresh->meta = $meta;
                $fresh->saveQuietly();
            }
            $redemption?->delete();
        });
    }

    /**
     * @param  list<array{product_id?: int|null, unit_price_minor: int, quantity: int}>  $lines
     */
    protected function assertCondition(Coupon $coupon, int $subtotalMinor, array $lines, ?int $userId): void
    {
        $type = $coupon->condition_type ?: 'none';
        $value = (int) ($coupon->condition_value ?? 0);
        if ($type === 'none' || $value <= 0) {
            return;
        }

        $ok = match ($type) {
            'order_nth' => $userId !== null && $this->paidOrderCount((int) $coupon->tenant_id, $userId) + 1 === $value,
            'min_amount' => $subtotalMinor >= $value,
            'min_items' => array_sum(array_map(fn ($l) => (int) ($l['quantity'] ?? 0), $lines)) >= $value,
            default => true,
        };

        if (! $ok) {
            throw ValidationException::withMessages(['coupon_code' => 'Coupon conditions not met']);
        }
    }

    protected function paidOrderCount(int $tenantId, int $userId): int
    {
        return Order::query()
            ->where('tenant_id', $tenantId)
            ->where('user_id', $userId)
            ->whereIn('status', OrderReports::salesStatuses())
            ->count();
    }

    /**
     * @param  list<array{product_id?: int|null, unit_price_minor: int, quantity: int}>  $lines
     */
    protected function eligibleSubtotal(Coupon $coupon, int $subtotalMinor, array $lines): int
    {
        $r = $coupon->restrictions ?? [];
        $productIds = $this->ids($r['product_ids'] ?? []);
        $categoryIds = $this->ids($r['category_ids'] ?? []);
        $brandIds = $this->ids($r['brand_ids'] ?? []);
        $excludeSale = (bool) $coupon->exclude_sale;

        if ($lines === [] || ($productIds === [] && $categoryIds === [] && $brandIds === [] && ! $excludeSale)) {
            return $subtotalMinor;
        }

        $lineProductIds = array_values(array_unique(array_filter(array_map(fn ($l) => (int) ($l['product_id'] ?? 0), $lines))));
        $products = Product::query()
            ->where('tenant_id', $coupon->tenant_id)
            ->whereIn('id', $lineProductIds)
            ->with(['categories', 'brands'])
            ->get()
            ->keyBy('id');

        $eligible = 0;
        $matched = false;
        foreach ($lines as $line) {
            $product = $products->get((int) ($line['product_id'] ?? 0));
            if (! $this->lineEligible($product, $productIds, $categoryIds, $brandIds, $excludeSale)) {
                continue;
            }
            $matched = true;
            $eligible += (int) $line['unit_price_minor'] * (int) $line['quantity'];
        }

        if (! $matched) {
            throw ValidationException::withMessages(['coupon_code' => 'Coupon not applicable to cart items']);
        }

        return $eligible;
    }

    /**
     * @param  list<int>  $productIds
     * @param  list<int>  $categoryIds
     * @param  list<int>  $brandIds
     */
    protected function lineEligible(?Product $product, array $productIds, array $categoryIds, array $brandIds, bool $excludeSale): bool
    {
        if ($productIds !== [] && (! $product || ! in_array((int) $product->id, $productIds, true))) {
            return false;
        }
        if ($categoryIds !== []) {
            if (! $product) {
                return false;
            }
            $cats = $product->categories->pluck('id')->map(fn ($id) => (int) $id)->all();
            if ($product->category_id) {
                $cats[] = (int) $product->category_id;
            }
            if (array_intersect($categoryIds, $cats) === []) {
                return false;
            }
        }
        if ($brandIds !== []) {
            if (! $product) {
                return false;
            }
            $brands = $product->brands->pluck('id')->map(fn ($id) => (int) $id)->all();
            if (array_intersect($brandIds, $brands) === []) {
                return false;
            }
        }
        if ($excludeSale && $product && $this->onSale($product)) {
            return false;
        }

        return true;
    }

    public function onSale(Product $product): bool
    {
        return $product->isOnSale();
    }

    /** @return list<int> */
    protected function ids(mixed $value): array
    {
        return array_values(array_filter(array_map('intval', (array) $value), fn ($id) => $id > 0));
    }
}
