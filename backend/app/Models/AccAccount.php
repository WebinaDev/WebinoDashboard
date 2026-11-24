<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A ledger account.
 *
 * Audited: editing a chart-of-accounts row after it has been posted to moves nothing in the
 * journal, but it changes how every past entry is read — which is exactly the change a trail
 * has to remember.
 */
class AccAccount extends Model
{
    use \App\Support\Audit\RecordsActivity;

    protected $table = 'accounting_accounts';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'type',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
