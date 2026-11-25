<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A counterparty: the customer or supplier a journal and an invoice point at.
 *
 * Audited, because renaming a partner or changing their national id silently rewrites the
 * meaning of invoices already issued to them.
 */
class AccPerson extends Model
{
    use \App\Support\Audit\RecordsActivity;

    protected $table = 'accounting_persons';

    protected $fillable = [
        'tenant_id',
        'name',
        'type',
        'phone',
        'national_id',
        'economic_code',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'meta' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
