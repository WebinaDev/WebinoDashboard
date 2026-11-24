<?php

namespace Modules\Cafe\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One short-lived code per browser token; deleted on success. */
class CafeGuestOtp extends Model
{
    protected $fillable = [
        'tenant_id',
        'guest_token',
        'phone',
        'code',
        'attempts',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'attempts' => 'integer',
            'expires_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
