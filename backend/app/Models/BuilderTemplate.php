<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BuilderTemplate extends Model
{
    protected $fillable = [
        'tenant_id',
        'kind',
        'title',
        'draft',
        'published',
    ];

    protected function casts(): array
    {
        return [
            'draft' => 'array',
            'published' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
