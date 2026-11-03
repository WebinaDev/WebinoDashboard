<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Sellers who only hold orders.own see and change orders they created.
 * POS-only cashiers (pos.use without orders.*) only see their own POS orders.
 */
final class OrderAccess
{
    public function __construct(private readonly CapabilityChecker $capabilities) {}

    public function restrictsToOwn(User $user): bool
    {
        if ((string) $user->role === 'admin') {
            return false;
        }
        if ($this->capabilities->allows($user, 'orders.*')) {
            return false;
        }

        return $this->capabilities->allows($user, 'orders.own');
    }

    public function isPosOnlyCashier(User $user): bool
    {
        if ((string) $user->role === 'admin') {
            return false;
        }
        if ($this->capabilities->allows($user, 'orders.*') || $this->capabilities->allows($user, 'orders.own')) {
            return false;
        }

        return $this->capabilities->allows($user, 'pos.use');
    }

    /**
     * @param  Builder<\Illuminate\Database\Eloquent\Model>  $query
     * @return Builder<\Illuminate\Database\Eloquent\Model>
     */
    public function scopeOwned(Builder $query, User $user, string $column = 'created_by'): Builder
    {
        if ($this->restrictsToOwn($user)) {
            $query->where($column, $user->id);
        }

        return $query;
    }

    /**
     * List/detail scoping: own-orders sellers + POS-only cashiers (their POS rows only).
     *
     * @param  Builder<\Illuminate\Database\Eloquent\Model>  $query
     * @return Builder<\Illuminate\Database\Eloquent\Model>
     */
    public function scopeForActor(Builder $query, User $user, string $column = 'created_by'): Builder
    {
        $this->scopeOwned($query, $user, $column);
        if ($this->isPosOnlyCashier($user)) {
            $query->where($column, $user->id)->where('is_pos', true);
        }

        return $query;
    }
}
