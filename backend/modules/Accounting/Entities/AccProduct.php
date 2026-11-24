<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccProduct extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_products';

    protected $fillable = [
        'tenant_id',        'name', 'unit', 'barcode', 'category', 'buy_price', 'sell_price', 'inventory_controlled',
    ];

    protected function casts(): array
    {
        return [
            'buy_price' => 'decimal:2',
            'sell_price' => 'decimal:2',
            'inventory_controlled' => 'boolean',
        ];
    }
}
