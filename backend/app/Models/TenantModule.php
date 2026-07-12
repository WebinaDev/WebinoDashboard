<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantModule extends Model
{
    protected $fillable = [
        'tenant_id',
        'module_slug',
        'enabled',
        'licensed',
        'installed_version',
        'synced_at',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'licensed' => 'boolean',
            'synced_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function definition(): BelongsTo
    {
        return $this->belongsTo(DashboardModule::class, 'module_slug', 'slug');
    }
}
