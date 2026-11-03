<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportCannedResponse extends Model
{
    protected $fillable = [
        'tenant_id',
        'department_id',
        'title_fa',
        'title_en',
        'body_fa',
        'body_en',
        'category',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(SupportDepartment::class, 'department_id');
    }
}
