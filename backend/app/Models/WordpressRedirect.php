<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WordpressRedirect extends Model
{
    protected $fillable = [
        'tenant_id',
        'from_path',
        'to_path',
        'status_code',
        'kind',
        'resource',
        'external_id',
    ];

    protected function casts(): array
    {
        return [
            'status_code' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
