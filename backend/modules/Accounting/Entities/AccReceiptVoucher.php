<?php

namespace Modules\Accounting\Entities;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

/**
 * Money received or paid, as a document.
 *
 * Audited: a receipt voucher settles a balance, and a settled balance somebody can quietly
 * edit is a settled balance nobody can prove.
 */
class AccReceiptVoucher extends Model
{
    use BelongsToTenant;
    use \App\Support\Audit\RecordsActivity;

    protected $table = 'acc_receipt_vouchers';

    protected $fillable = [
        'tenant_id',        'type', 'number', 'fiscal_year_id', 'cash_account_id', 'person_id', 'amount',
        'document_date', 'status', 'description', 'created_by', 'journal_entry_id',
    ];

    protected function casts(): array
    {
        return [
            'document_date' => 'date',
            'amount' => 'decimal:2',
        ];
    }

    public function fiscalYear(): BelongsTo
    {
        return $this->belongsTo(AccFiscalYear::class, 'fiscal_year_id');
    }

    public function cashAccount(): BelongsTo
    {
        return $this->belongsTo(AccCashAccount::class, 'cash_account_id');
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(AccPerson::class, 'person_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The ledger entry this voucher posted, once it has been confirmed. */
    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(AccJournalEntry::class, 'journal_entry_id');
    }
}
