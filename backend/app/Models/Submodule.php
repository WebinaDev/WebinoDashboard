<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Submodule extends Model
{
    protected $fillable = [
        'module_slug',
        'slug',
        'name_fa',
        'name_en',
        'admin_nav',
        'public_routes',
        'is_core',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'admin_nav' => 'array',
            'public_routes' => 'array',
            'is_core' => 'boolean',
        ];
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(DashboardModule::class, 'module_slug', 'slug');
    }
}
