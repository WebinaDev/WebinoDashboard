<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttributeGroup extends Model
{
    protected $fillable = [
        'tenant_id',
        'name',
        'attribute_ids',
    ];

    protected function casts(): array
    {
        return [
            'attribute_ids' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
