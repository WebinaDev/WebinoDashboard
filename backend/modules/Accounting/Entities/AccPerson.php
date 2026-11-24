<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccPerson extends Model
{
    use BelongsToTenant;
    use \App\Support\Audit\RecordsActivity;

    protected $table = 'acc_persons';

    protected $fillable = [
        'tenant_id', 'name', 'type', 'national_id', 'economic_code', 'mobile', 'address', 'category',
        // Credit control lives on the party, not in a parallel table: one place to look.
        'credit_limit', 'is_blocked',
    ];

    protected function casts(): array
    {
        return [
            'credit_limit' => 'decimal:2',
            'is_blocked' => 'boolean',
        ];
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(AccountingInvoice::class, 'person_id');
    }
}
