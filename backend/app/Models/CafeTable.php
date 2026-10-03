<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CafeTable extends Model
{
    protected $fillable = [
        'tenant_id',
        'branch_id',
        'code',
        'label',
        'seats',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'seats' => 'integer',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }
}
