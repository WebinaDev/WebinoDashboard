<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SiteType extends Model
{
    protected $primaryKey = 'slug';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'slug',
        'name_fa',
        'name_en',
        'default_theme_slug',
        'sort_order',
    ];

    public function activations(): HasMany
    {
        return $this->hasMany(SiteTypeActivation::class, 'site_type_slug', 'slug');
    }
}
