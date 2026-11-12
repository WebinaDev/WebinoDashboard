<?php

namespace App\Services\Membership;

use App\Models\Membership\MembershipGrant;
use App\Models\Membership\MembershipPlan;
use App\Models\User;

class MembershipPresenter
{
    public static function plan(MembershipPlan $p, bool $admin = false): array
    {
        $price = (int) $p->price_minor;
        $effective = $p->effectivePriceMinor();
        $row = [
            'id' => $p->id,
            'name' => $p->name,
            'slug' => $p->slug,
            'description' => $p->description,
            'duration_value' => (int) $p->duration_value,
            'duration_unit' => $p->duration_unit,
            'duration_label' => __('membership.duration.'.$p->duration_unit, ['count' => $p->duration_value]),
            'price_minor' => $effective,
            'regular_price_minor' => $price,
            'on_sale' => $effective < $price,
            'currency' => $p->currency ?: ($p->product?->currency ?? null),
            'product_id' => $p->product_id,
            'badge' => $p->badge,
            'is_featured' => (bool) $p->is_featured,
        ];
        if ($admin) {
            $row += ['sale_price_minor' => $p->sale_price_minor, 'is_active' => (bool) $p->is_active, 'sort' => (int) $p->sort,
                'members_count' => MembershipGrant::query()->where('plan_id', $p->id)->whereNull('revoked_at')->distinct()->count('user_id')];
        }

        return $row;
    }

    public static function grant(MembershipGrant $g): array
    {
        return [
            'id' => $g->id,
            'plan' => $g->relationLoaded('plan') && $g->plan ? ['id' => $g->plan->id, 'name' => $g->plan->name] : null,
            'source' => $g->source,
            'order_id' => $g->order_id,
            'duration_value' => (int) $g->duration_value,
            'duration_unit' => $g->duration_unit,
            'starts_at' => $g->starts_at?->toIso8601String(),
            'ends_at' => $g->ends_at?->toIso8601String(),
            'revoked_at' => $g->revoked_at?->toIso8601String(),
            'note' => $g->note,
            'created_at' => $g->created_at?->toIso8601String(),
        ];
    }

    public static function member(User $u, MembershipService $m): array
    {
        return [
            'id' => $u->id,
            'name' => $u->name,
            'phone' => $u->phone,
            'email' => $u->email,
            'is_premium' => $m->isPremium($u),
            'premium_until' => $u->premium_until?->toIso8601String(),
        ];
    }
}
