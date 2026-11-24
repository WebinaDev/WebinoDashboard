<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccCashAccount extends Model
{
    use BelongsToTenant;
    use \App\Support\Audit\RecordsActivity;

    protected $table = 'acc_cash_accounts';

    protected $fillable = [
        'tenant_id',        'name', 'type', 'bank_name', 'account_number', 'sheba', 'card_number', 'chart_code', 'is_active', 'is_default',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_default' => 'boolean',
        ];
    }

    public function receiptVouchers(): HasMany
    {
        return $this->hasMany(AccReceiptVoucher::class, 'cash_account_id');
    }
}
