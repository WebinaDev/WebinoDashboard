<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ModuleSetting extends Model
{
    protected $fillable = [
        'tenant_id',
        'module_slug',
        'submodule_slug',
        'payload',
    ];

    protected static function booted(): void
    {
        // Any write path (service, import, tinker) drops the cached copy so the public site reads it at once.
        $forget = fn (self $row) => \Illuminate\Support\Facades\Cache::forget(
            \App\Services\Modules\ModuleSettingsService::cacheKey((int) $row->tenant_id, (string) $row->module_slug, (string) $row->submodule_slug)
        );
        static::saved($forget);
        static::deleted($forget);
    }

    protected function casts(): array
    {
        return [
            'payload' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
