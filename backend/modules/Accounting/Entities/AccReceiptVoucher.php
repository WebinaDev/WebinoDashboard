<?php

namespace Modules\Accounting\Entities;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccReceiptVoucher extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_receipt_vouchers';

    protected $fillable = [
        'tenant_id',        'type', 'number', 'fiscal_year_id', 'cash_account_id', 'person_id', 'amount',
        'document_date', 'status', 'description', 'created_by',
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
}
