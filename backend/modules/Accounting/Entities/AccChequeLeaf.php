<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccChequeLeaf extends Model
{
    use BelongsToTenant;

    public const UNUSED = 'unused';

    public const ISSUED = 'issued';

    public const CANCELLED = 'cancelled';

    public const LOST = 'lost';

    protected $table = 'acc_cheque_leaves';

    protected $fillable = [
        'tenant_id', 'cheque_book_id', 'leaf_number', 'status', 'check_id', 'person_id',
        'amount', 'due_date', 'issued_on', 'note',
    ];

    protected function casts(): array
    {
        return [
            'leaf_number' => 'integer',
            'amount' => 'decimal:2',
            'due_date' => 'date',
            'issued_on' => 'date',
        ];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(AccChequeBook::class, 'cheque_book_id');
    }

    public function check(): BelongsTo
    {
        return $this->belongsTo(AccCheck::class, 'check_id');
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(AccPerson::class, 'person_id');
    }
}
