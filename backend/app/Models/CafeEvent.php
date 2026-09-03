<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CafeEvent extends Model
{
    protected $fillable = [
        'tenant_id',
        'branch_id',
        'title_fa',
        'title_en',
        'description_fa',
        'description_en',
        'starts_at',
        'ends_at',
        'capacity',
        'price_minor',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'capacity' => 'integer',
            'price_minor' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(EventBooking::class, 'event_id');
    }
}
