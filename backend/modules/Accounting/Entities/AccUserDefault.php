<?php

namespace Modules\Accounting\Entities;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccUserDefault extends Model
{
    protected $table = 'acc_user_defaults';

    protected $fillable = [
        'user_id',
        'fiscal_year_id',
        'cash_account_id',
        'warehouse_id',
        'price_list_id',
        'tax_rate',
    ];

    protected function casts(): array
    {
        return [
            'tax_rate' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function fiscalYear(): BelongsTo
    {
        return $this->belongsTo(AccFiscalYear::class, 'fiscal_year_id');
    }

    public function cashAccount(): BelongsTo
    {
        return $this->belongsTo(AccCashAccount::class, 'cash_account_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(AccWarehouse::class, 'warehouse_id');
    }
}
