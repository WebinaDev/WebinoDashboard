<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Table uses composite primary key (module_slug, slug) with no id column.
 * Eloquent must not treat this as an auto-incrementing model or Postgres
 * INSERT ... RETURNING "id" will fail during webino:kernel-sync.
 */
class Submodule extends Model
{
    public $incrementing = false;

    protected $primaryKey = null;

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

    public function getIncrementing(): bool
    {
        return false;
    }

    protected function setKeysForSaveQuery($query)
    {
        return $query
            ->where('module_slug', $this->getAttribute('module_slug'))
            ->where('slug', $this->getAttribute('slug'));
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(DashboardModule::class, 'module_slug', 'slug');
    }
}
