<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One tender against an order. Several rows describe a split payment. */
class OrderPayment extends Model
{
    use RecordsActivity;

    protected $fillable = [
        'tenant_id',
        'order_id',
        'branch_id',
        'tender',
        'amount_minor',
        'received_minor',
        'change_minor',
        'reference',
        'recorded_by',
    ];

    protected function casts(): array
    {
        return [
            'amount_minor' => 'integer',
            'received_minor' => 'integer',
            'change_minor' => 'integer',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }
}
