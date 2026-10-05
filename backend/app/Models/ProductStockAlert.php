<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductStockAlert extends Model
{
    public const TYPE_BACK_IN_STOCK = 'back_in_stock';

    public const TYPE_ON_SALE = 'on_sale';

    protected $fillable = [
        'tenant_id',
        'product_id',
        'user_id',
        'guest_token',
        'channel',
        'destination',
        'alert_type',
        'notified_at',
    ];

    protected function casts(): array
    {
        return [
            'notified_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
