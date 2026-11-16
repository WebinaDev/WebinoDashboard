<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A browser token whose phone number was proven with an OTP. */
class CafeGuestVerification extends Model
{
    protected $fillable = [
        'tenant_id',
        'guest_token',
        'phone',
        'verified_at',
        'locked_until',
    ];

    protected function casts(): array
    {
        return [
            'verified_at' => 'datetime',
            'locked_until' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
