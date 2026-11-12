<?php

namespace App\Services\Membership;

use App\Models\Membership\MembershipDownload;
use App\Models\Membership\MembershipGrant;
use App\Models\Membership\MembershipPlan;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Http\Middleware\EnsureStaffRole;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Premium membership: who is premium, grants from paid orders (extend from the current end date),
 * revocation on refund or cancel, the member shop discount and the free download quota.
 */
class MembershipService
{
    /** Order statuses that mean the money is in. */
    public const PAID = ['paid', 'processing', 'shipped', 'completed', 'delivered'];

    /** Statuses that take back a grant that came from a paid order. */
    public const REVERSED = ['refunded', 'cancelled'];

    public function __construct(protected MembershipSettings $settings) {}

    public function settings(int $tenantId): array
    {
        return $this->settings->get($tenantId);
    }

    public function isPremium(?User $user): bool
    {
        return $user !== null && $user->premium_until !== null && $user->premium_until->isFuture();
    }

    /** Full access to premium content: membership off, an active member, or (optionally) staff of this site. */
    public function hasFullAccess(int $tenantId, ?User $user): bool
    {
        $cfg = $this->settings($tenantId);
        if (! $cfg['enabled']) {
            return true;
        }
        if (! $user || (int) $user->tenant_id !== $tenantId) {
            return false;
        }
        if ($this->isPremium($user)) {
            return true;
        }

        return $cfg['staff_full_access'] && in_array((string) $user->role, EnsureStaffRole::ROLES, true);
    }

    /** @return array<string, mixed> account view: premium state and download quota */
    public function status(int $tenantId, User $user): array
    {
        $cfg = $this->settings($tenantId);
        $premium = $this->isPremium($user);
        $unlimited = $this->hasFullAccess($tenantId, $user);
        $grant = MembershipGrant::query()->with('plan')->where('tenant_id', $tenantId)->where('user_id', $user->id)
            ->whereNull('revoked_at')->where('ends_at', '>', now())->orderByDesc('ends_at')->first();
        $quota = [];
        foreach (['audio', 'video'] as $kind) {
            $limit = (int) $cfg['downloads']['free_'.$kind];
            $used = $this->downloadsUsed($tenantId, $user, $kind, $cfg['downloads']['period']);
            $quota[$kind] = [
                'unlimited' => $unlimited,
                'limit' => $unlimited ? null : $limit,
                'used' => $used,
                'remaining' => $unlimited ? null : max(0, $limit - $used),
            ];
        }

        return [
            'enabled' => (bool) $cfg['enabled'],
            'is_premium' => $premium,
            'premium_until' => $premium ? $user->premium_until->toIso8601String() : null,
            'days_left' => $premium ? (int) ceil(now()->diffInSeconds($user->premium_until) / 86400) : 0,
            'plan' => $premium && $grant?->plan ? ['id' => $grant->plan->id, 'name' => $grant->plan->name, 'slug' => $grant->plan->slug] : null,
            'discount_percent' => $premium && $cfg['enabled'] ? (float) $cfg['discount_percent'] : 0,
            'downloads' => $quota + ['period' => $cfg['downloads']['period']],
        ];
    }

    public function downloadsUsed(int $tenantId, User $user, string $kind, string $period = 'lifetime'): int
    {
        $q = MembershipDownload::query()->where('tenant_id', $tenantId)->where('user_id', $user->id)->where('kind', $kind);
        if ($period === 'month') {
            $q->where('created_at', '>=', now()->startOfMonth());
        }

        return $q->count();
    }

    /**
     * Record a download and say whether it is allowed. Downloading the same item again is free.
     *
     * @return array{allowed: bool, remaining: int|null}
     */
    public function consumeDownload(int $tenantId, User $user, int $mediaId, string $kind): array
    {
        $cfg = $this->settings($tenantId);
        $unlimited = $this->hasFullAccess($tenantId, $user);

        return DB::transaction(function () use ($tenantId, $user, $mediaId, $kind, $cfg, $unlimited) {
            $q = MembershipDownload::query()->where('tenant_id', $tenantId)->where('user_id', $user->id)->where('media_id', $mediaId);
            if ($cfg['downloads']['period'] === 'month') {
                $q->where('created_at', '>=', now()->startOfMonth());
            }
            if ($q->exists()) {
                return ['allowed' => true, 'remaining' => $unlimited ? null : max(0, (int) $cfg['downloads']['free_'.$kind] - $this->downloadsUsed($tenantId, $user, $kind, $cfg['downloads']['period']))];
            }
            User::query()->whereKey($user->id)->lockForUpdate()->first();
            $limit = (int) $cfg['downloads']['free_'.$kind];
            $used = $this->downloadsUsed($tenantId, $user, $kind, $cfg['downloads']['period']);
            if (! $unlimited && $used >= $limit) {
                return ['allowed' => false, 'remaining' => 0];
            }
            MembershipDownload::query()->where('user_id', $user->id)->where('media_id', $mediaId)->delete();
            MembershipDownload::query()->create(['tenant_id' => $tenantId, 'user_id' => $user->id, 'media_id' => $mediaId, 'kind' => $kind]);

            return ['allowed' => true, 'remaining' => $unlimited ? null : max(0, $limit - $used - 1)];
        });
    }

    /** Add a period of premium access and move premium_until. */
    public function grant(User $user, int $value, string $unit, array $attrs = []): MembershipGrant
    {
        return DB::transaction(function () use ($user, $value, $unit, $attrs) {
            $grant = MembershipGrant::query()->create(array_merge([
                'tenant_id' => (int) $user->tenant_id,
                'user_id' => $user->id,
                'source' => 'admin',
                'duration_value' => max(1, $value),
                'duration_unit' => in_array($unit, MembershipPlan::UNITS, true) ? $unit : 'day',
            ], $attrs));
            $this->recompute($user);

            return $grant->fresh();
        });
    }

    public function revoke(MembershipGrant $grant): void
    {
        if ($grant->revoked_at) {
            return;
        }
        $grant->forceFill(['revoked_at' => now()])->save();
        if ($user = User::query()->find($grant->user_id)) {
            $this->recompute($user);
        }
    }

    /**
     * Lay the active grants end to end: each one starts when it was given, or when the
     * previous one ends if that is later. premium_until is the end of the last one.
     */
    public function recompute(User $user): void
    {
        $cursor = null;
        $grants = MembershipGrant::query()->where('tenant_id', $user->tenant_id)->where('user_id', $user->id)
            ->whereNull('revoked_at')->orderBy('created_at')->orderBy('id')->get();
        foreach ($grants as $g) {
            $given = Carbon::parse($g->created_at);
            $start = $cursor && $cursor->greaterThan($given) ? $cursor->copy() : $given->copy();
            $end = self::addDuration($start, $g->duration_value, $g->duration_unit);
            $g->forceFill(['starts_at' => $start, 'ends_at' => $end])->saveQuietly();
            $cursor = $end;
        }
        $user->forceFill(['premium_until' => $cursor && $cursor->isFuture() ? $cursor : null])->save();
    }

    public static function addDuration(CarbonInterface $from, int $value, string $unit): Carbon
    {
        $d = Carbon::instance($from);

        return match ($unit) {
            'year' => $d->copy()->addYearsNoOverflow($value),
            'month' => $d->copy()->addMonthsNoOverflow($value),
            default => $d->copy()->addDays($value),
        };
    }

    /** Order status edge: grant on paid, take back on refund or cancel. Never breaks the order flow. */
    public function syncOrder(Order $order, ?string $from, string $to): void
    {
        try {
            $wasPaid = in_array((string) $from, self::PAID, true);
            if (in_array($to, self::PAID, true) && ! $wasPaid) {
                $this->grantFromOrder($order);
            } elseif ($wasPaid && in_array($to, self::REVERSED, true)) {
                foreach (MembershipGrant::query()->where('order_id', $order->id)->whereNull('revoked_at')->get() as $g) {
                    $this->revoke($g);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('membership.order_sync_failed', ['order_id' => $order->id, 'message' => $e->getMessage()]);
        }
    }

    public function grantFromOrder(Order $order): int
    {
        if (! $order->user_id || ! ($user = User::query()->find($order->user_id))) {
            return 0;
        }
        $count = 0;
        foreach (OrderItem::query()->where('order_id', $order->id)->get() as $item) {
            $plan = $this->planForProduct((int) $order->tenant_id, (int) $item->product_id);
            if (! $plan) {
                continue;
            }
            $existing = MembershipGrant::query()->where('order_item_id', $item->id)->first();
            if ($existing) {
                if ($existing->revoked_at) {
                    $existing->forceFill(['revoked_at' => null])->save();
                    $this->recompute($user);
                    $count++;
                }

                continue;
            }
            $this->grant($user, $plan->duration_value * max(1, (int) $item->quantity), $plan->duration_unit, [
                'plan_id' => $plan->id, 'order_id' => $order->id, 'order_item_id' => $item->id, 'source' => 'order',
            ]);
            $count++;
        }

        return $count;
    }

    public function planForProduct(int $tenantId, int $productId): ?MembershipPlan
    {
        return $productId > 0 ? MembershipPlan::query()->where('tenant_id', $tenantId)->where('product_id', $productId)->first() : null;
    }

    /** Products that are membership plans (no member discount on them). */
    public function planProductIds(int $tenantId): array
    {
        return MembershipPlan::query()->where('tenant_id', $tenantId)->whereNotNull('product_id')->pluck('product_id')->map(fn ($v) => (int) $v)->all();
    }

    /**
     * Member discount on shop products (plans excluded).
     *
     * @param  array<int, array{product_id: int, unit_price_minor: int, quantity: int}>  $lines
     * @return array{percent: float, eligible_minor: int, discount_minor: int}|null
     */
    public function shopDiscount(int $tenantId, ?int $userId, array $lines): ?array
    {
        if (! $userId) {
            return null;
        }
        $cfg = $this->settings($tenantId);
        $percent = (float) $cfg['discount_percent'];
        if (! $cfg['enabled'] || $percent <= 0) {
            return null;
        }
        $user = User::query()->find($userId);
        if (! $user || (int) $user->tenant_id !== $tenantId || ! $this->isPremium($user)) {
            return null;
        }
        $skip = array_flip($this->planProductIds($tenantId));
        $eligible = 0;
        foreach ($lines as $l) {
            if (! isset($skip[(int) $l['product_id']])) {
                $eligible += (int) $l['unit_price_minor'] * (int) $l['quantity'];
            }
        }
        $discount = (int) floor($eligible * $percent / 100);

        return $discount > 0 ? ['percent' => $percent, 'eligible_minor' => $eligible, 'discount_minor' => $discount] : null;
    }

    /** Create or update the shop product that sells this plan (virtual, not listed in the catalog). */
    public function syncPlanProduct(MembershipPlan $plan): Product
    {
        $product = $plan->product_id ? Product::query()->where('tenant_id', $plan->tenant_id)->find($plan->product_id) : null;
        $currency = $plan->currency ?: (Tenant::query()->whereKey($plan->tenant_id)->value('default_currency') ?: 'IRT');
        $sale = $plan->sale_price_minor !== null && $plan->sale_price_minor > 0 && $plan->sale_price_minor < $plan->price_minor ? (int) $plan->sale_price_minor : null;
        $meta = array_merge(is_array($product?->meta) ? $product->meta : [], ['virtual' => true, 'membership_plan_id' => $plan->id]);
        $attrs = [
            'name' => $plan->name,
            'short_description' => $plan->description ? Str::limit(strip_tags((string) $plan->description), 250) : null,
            'price_minor' => (int) $plan->price_minor,
            'sale_price_minor' => $sale,
            'currency' => $currency,
            'status' => $plan->is_active ? 'publish' : 'draft',
            'is_available' => (bool) $plan->is_active,
            'is_hidden' => false,
            'is_sold_out' => false,
            'manage_stock' => false,
            'stock_status' => 'instock',
            'catalog_visibility' => 'hidden',
            'type' => 'simple',
            'meta' => $meta,
        ];
        if ($product) {
            $product->fill($attrs)->save();
        } else {
            $slug = 'membership-'.$plan->slug;
            $i = 2;
            while (Product::query()->where('tenant_id', $plan->tenant_id)->where('slug', $slug)->exists()) {
                $slug = 'membership-'.$plan->slug.'-'.$i++;
            }
            $product = Product::query()->create($attrs + ['tenant_id' => $plan->tenant_id, 'slug' => $slug]);
            $plan->forceFill(['product_id' => $product->id])->saveQuietly();
        }

        return $product;
    }

    /** Every line is a virtual product (membership plan): no shipping and no postal address. */
    public static function virtualOnly(Collection $lines): bool
    {
        $lines = $lines->filter(fn ($l) => $l->product);

        return $lines->isNotEmpty() && $lines->every(fn ($l) => ! empty(($l->product->meta ?? [])['virtual']));
    }
}
