<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccPerson extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_persons';

    protected $fillable = [
        'tenant_id',        'name', 'type', 'national_id', 'economic_code', 'mobile', 'address', 'category',
    ];

    public function invoices(): HasMany
    {
        return $this->hasMany(AccountingInvoice::class, 'person_id');
    }
}
