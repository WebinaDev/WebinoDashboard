<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VendorWithdrawal extends Model
{
    protected $fillable = [
        'tenant_id',
        'vendor_store_id',
        'amount_minor',
        'currency',
        'status',
        'bank_sheba',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'amount_minor' => 'integer',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(VendorStore::class, 'vendor_store_id');
    }
}
