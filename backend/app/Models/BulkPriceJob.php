<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BulkPriceJob extends Model
{
    protected $fillable = [
        'tenant_id',
        'status',
        'params',
        'state',
        'last_log',
        'locked',
    ];

    protected function casts(): array
    {
        return [
            'params' => 'array',
            'state' => 'array',
            'locked' => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
