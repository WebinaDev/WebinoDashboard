<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccChequeBook extends Model
{
    use BelongsToTenant;
    use \App\Support\Audit\RecordsActivity;

    protected $table = 'acc_cheque_books';

    protected $fillable = [
        'tenant_id', 'cash_account_id', 'title', 'bank', 'series_from', 'series_to',
        'void_from', 'void_to', 'is_active', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'void_from' => 'integer',
            'void_to' => 'integer',
        ];
    }

    public function cashAccount(): BelongsTo
    {
        return $this->belongsTo(AccCashAccount::class, 'cash_account_id');
    }

    public function leaves(): HasMany
    {
        return $this->hasMany(AccChequeLeaf::class, 'cheque_book_id')->orderBy('leaf_number');
    }
}
