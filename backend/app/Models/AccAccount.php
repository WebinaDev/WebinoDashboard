<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccAccount extends Model
{
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
