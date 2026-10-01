<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WordpressImportLink extends Model
{
    protected $fillable = [
        'tenant_id',
        'resource',
        'external_id',
        'source_guid',
        'local_type',
        'local_id',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
