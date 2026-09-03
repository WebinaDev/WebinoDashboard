<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EventBooking extends Model
{
    protected $fillable = [
        'event_id',
        'guest_name',
        'guest_phone',
        'seats',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'seats' => 'integer',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(CafeEvent::class, 'event_id');
    }
}
