<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CouponRedemption extends Model
{
    protected $fillable = [
        'tenant_id',
        'coupon_id',
        'user_id',
        'order_id',
        'discount_minor',
    ];

    protected function casts(): array
    {
        return ['discount_minor' => 'integer'];
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }
}
