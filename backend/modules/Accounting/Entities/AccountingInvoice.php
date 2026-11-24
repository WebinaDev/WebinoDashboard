<?php

namespace Modules\Accounting\Entities;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccountingInvoice extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_invoices';

    protected $fillable = [
        'tenant_id',        'type', 'number', 'fiscal_year_id', 'person_id', 'document_date', 'status',
        'items', 'subtotal', 'tax', 'total', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'document_date' => 'date',
            'items' => 'array',
            'subtotal' => 'decimal:2',
            'tax' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    public function fiscalYear(): BelongsTo
    {
        return $this->belongsTo(AccFiscalYear::class, 'fiscal_year_id');
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
