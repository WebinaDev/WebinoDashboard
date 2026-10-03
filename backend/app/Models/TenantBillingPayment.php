<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantBillingPayment extends Model
{
    protected $fillable = [
        'tenant_id',
        'erp_payment_id',
        'bill_id',
        'bill_kind',
        'bill_title',
        'gateway',
        'mode',
        'base_minor',
        'fee_minor',
        'fee_percent',
        'total_minor',
        'currency',
        'status',
        'redirect_url',
    ];

    protected function casts(): array
    {
        return [
            'fee_percent' => 'float',
            'base_minor' => 'integer',
            'fee_minor' => 'integer',
            'total_minor' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
