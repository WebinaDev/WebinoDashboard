<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BuilderGlobal extends Model
{
    protected $fillable = [
        'tenant_id',
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
