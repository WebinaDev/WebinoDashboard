<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccInvoice extends Model
{
    protected $table = 'accounting_invoices';

    protected $fillable = [
        'tenant_id',
        'order_id',
        'person_id',
        'journal_id',
        'number',
        'type',
        'status',
        'issue_date',
        'subtotal_minor',
        'discount_minor',
        'tax_minor',
        'total_minor',
        'currency',
        'moadian_status',
        'moadian_reference',
        'moadian_pattern',
        'buyer_register_number',
        'buyer_tax',
        'meta',
        'moadian_sent_at',
    ];

    protected function casts(): array
    {
        return [
            'issue_date' => 'date',
            'subtotal_minor' => 'integer',
            'discount_minor' => 'integer',
            'tax_minor' => 'integer',
            'total_minor' => 'integer',
            'moadian_pattern' => 'integer',
            'buyer_tax' => 'array',
            'meta' => 'array',
            'moadian_sent_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(AccPerson::class, 'person_id');
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(AccJournal::class, 'journal_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(AccInvoiceLine::class, 'invoice_id');
    }

    public function moadianJobs(): HasMany
    {
        return $this->hasMany(AccMoadianJob::class, 'invoice_id');
    }
}
