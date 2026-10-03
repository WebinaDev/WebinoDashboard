<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WordpressImportQueue extends Model
{
    protected $table = 'wordpress_import_queue';

    protected $fillable = [
        'tenant_id',
        'job_id',
        'resource',
        'external_id',
        'label',
        'status',
        'payload',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
