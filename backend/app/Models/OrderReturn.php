<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderReturn extends Model
{
    protected $fillable = [
        'tenant_id',
        'order_id',
        'user_id',
        'status',
        'reason',
        'items',
        'refund_minor',
        'admin_note',
    ];

    protected function casts(): array
    {
        return [
            'items' => 'array',
            'refund_minor' => 'integer',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
