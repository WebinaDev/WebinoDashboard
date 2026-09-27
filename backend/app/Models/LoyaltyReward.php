<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LoyaltyReward extends Model
{
    protected $fillable = [
        'tenant_id',
        'uid',
        'title',
        'image_url',
        'points_cost',
        'discount_type',
        'discount_amount',
        'min_cart_minor',
        'validity_days',
        'product_ids',
        'category_ids',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'points_cost' => 'integer',
            'discount_amount' => 'integer',
            'min_cart_minor' => 'integer',
            'validity_days' => 'integer',
            'product_ids' => 'array',
            'category_ids' => 'array',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function ledger(): HasMany
    {
        return $this->hasMany(LoyaltyLedger::class);
    }
}
