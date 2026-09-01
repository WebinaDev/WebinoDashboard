<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SiteTypeActivation extends Model
{
    protected $fillable = [
        'site_type_slug',
        'module_slug',
        'submodule_slug',
        'enabled_by_default',
    ];

    protected function casts(): array
    {
        return [
            'enabled_by_default' => 'boolean',
        ];
    }

    public function siteType(): BelongsTo
    {
        return $this->belongsTo(SiteType::class, 'site_type_slug', 'slug');
    }
}
