<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceOrderMap extends Model
{
    protected $fillable = [
        'tenant_id',
        'platform',
        'remote_order_id',
        'order_id',
        'status',
        'fulfillment',
        'raw',
        'last_sync_at',
    ];

    protected function casts(): array
    {
        return [
            'raw' => 'array',
            'last_sync_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
