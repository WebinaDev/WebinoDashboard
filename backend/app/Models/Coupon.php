<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Coupon extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'code',
        'type',
        'amount',
        'free_shipping',
        'individual_use',
        'exclude_sale',
        'min_spend_minor',
        'max_spend_minor',
        'usage_limit',
        'usage_limit_per_user',
        'usage_count',
        'expires_at',
        'status',
        'description',
        'restrictions',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'free_shipping' => 'boolean',
            'individual_use' => 'boolean',
            'exclude_sale' => 'boolean',
            'min_spend_minor' => 'integer',
            'max_spend_minor' => 'integer',
            'usage_limit' => 'integer',
            'usage_limit_per_user' => 'integer',
            'usage_count' => 'integer',
            'expires_at' => 'datetime',
            'restrictions' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function redemptions(): HasMany
    {
        return $this->hasMany(CouponRedemption::class);
    }
}
