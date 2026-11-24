<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccJournal extends Model
{
    use RecordsActivity;

    /**
     * Journal lines are audited through AccJournalLine, and `totals` change on every
     * repost — neither tells a reader anything they cannot get from the lines.
     *
     * A manual journal (source = manual/admin) is the one entry a person writes by hand,
     * so its created/updated events are exactly what the trail is for.
     */
    protected array $activityHidden = ['total_debit_minor', 'total_credit_minor'];

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
