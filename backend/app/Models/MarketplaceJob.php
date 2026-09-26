<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketplaceJob extends Model
{
    protected $fillable = [
        'tenant_id',
        'platform',
        'job_type',
        'priority',
        'payload',
        'status',
        'attempts',
        'last_error',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'priority' => 'integer',
            'attempts' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }
}
