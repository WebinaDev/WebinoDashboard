<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccPerson extends Model
{
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
