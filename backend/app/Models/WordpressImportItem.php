<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WordpressImportItem extends Model
{
    protected $fillable = [
        'job_id',
        'tenant_id',
        'resource',
        'external_id',
        'payload',
        'status',
        'action',
        'message',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
        ];
    }

    public function job(): BelongsTo
    {
        return $this->belongsTo(WordpressImportJob::class, 'job_id');
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
