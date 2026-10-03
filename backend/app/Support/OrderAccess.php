<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Sellers who only hold orders.own see and change orders they created.
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
}
