<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantSubmoduleActivation extends Model
{
    protected $fillable = [
        'tenant_id',
        'module_slug',
        'submodule_slug',
        'enabled',
        'licensed',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'licensed' => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
