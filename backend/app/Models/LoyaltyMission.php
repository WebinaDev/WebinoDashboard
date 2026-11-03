<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltyMission extends Model
{
    public const TYPES = [
        'daily_checkin',
        'welcome',
        'referral',
        'first_order',
        'order_count',
        'order_amount',
        'review',
        'birthday',
        'custom',
    ];

    protected $fillable = [
        'tenant_id',
        'type',
        'title',
        'description',
        'points',
        'config',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'points' => 'integer',
            'config' => 'array',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
