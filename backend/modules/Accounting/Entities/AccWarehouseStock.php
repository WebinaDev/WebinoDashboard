<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccWarehouseStock extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_warehouse_stock';

    protected $fillable = [
        'tenant_id',        'warehouse_id', 'product_id', 'quantity', 'reorder_point',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:4',
            'reorder_point' => 'decimal:4',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(AccWarehouse::class, 'warehouse_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(AccProduct::class, 'product_id');
    }
}
