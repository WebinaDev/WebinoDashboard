<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccJournal extends Model
{
    protected $table = 'accounting_journals';

    protected $fillable = [
        'tenant_id',
        'order_id',
        'number',
        'date',
        'description',
        'status',
        'source',
        'total_debit_minor',
        'total_credit_minor',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'total_debit_minor' => 'integer',
            'total_credit_minor' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(AccJournalLine::class, 'journal_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
