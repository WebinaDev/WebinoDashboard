<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccJournalLine extends Model
{
    protected $table = 'accounting_journal_lines';

    protected $fillable = [
        'journal_id',
        'account_code',
        'account_name',
        'debit_minor',
        'credit_minor',
    ];

    protected function casts(): array
    {
        return [
            'debit_minor' => 'integer',
            'credit_minor' => 'integer',
        ];
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(AccJournal::class, 'journal_id');
    }
}
