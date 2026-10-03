<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WordpressImportReceipt extends Model
{
    protected $fillable = [
        'tenant_id',
        'idempotency_key',
        'status_code',
        'body',
    ];

    protected function casts(): array
    {
        return [
            'status_code' => 'integer',
            'body' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
