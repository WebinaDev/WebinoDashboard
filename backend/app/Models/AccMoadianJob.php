<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccMoadianJob extends Model
{
    protected $table = 'accounting_moadian_jobs';

    protected $fillable = [
        'tenant_id',
        'invoice_id',
        'action',
        'status',
        'attempts',
        'last_error',
        'request_payload',
        'response_payload',
        'reference_number',
        'run_after',
        'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'attempts' => 'integer',
            'request_payload' => 'array',
            'response_payload' => 'array',
            'run_after' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(AccInvoice::class, 'invoice_id');
    }
}
