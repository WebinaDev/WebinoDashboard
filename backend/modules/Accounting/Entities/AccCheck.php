<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccCheck extends Model
{
    use BelongsToTenant;
    use \App\Support\Audit\RecordsActivity;

    protected $table = 'acc_checks';

    protected $fillable = [
        'tenant_id',        'type', 'number', 'bank', 'amount', 'due_date', 'status', 'cash_account_id', 'person_id',
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date',
            'amount' => 'decimal:2',
        ];
    }

    public function cashAccount(): BelongsTo
    {
        return $this->belongsTo(AccCashAccount::class, 'cash_account_id');
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(AccPerson::class, 'person_id');
    }
}
