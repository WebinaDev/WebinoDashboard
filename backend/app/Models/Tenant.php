<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tenant extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'domain',
        'license_key',
        'setup_completed',
        'store_display_name',
        'default_currency',
        'business_category_slug',
        'business_type_slug',
        'site_type_slug',
        'default_locale',
        'vertical',
        'package_sku',
        'theme_preset',
        'active_theme_slug',
        'nav_preset',
        'branding',
        'home_blocks',
        'provision_token',
        'crm_account_id',
    ];

    protected function casts(): array
    {
        return [
            'setup_completed' => 'boolean',
            'nav_preset' => 'array',
            'branding' => 'array',
            'home_blocks' => 'array',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function modules(): HasMany
    {
        return $this->hasMany(TenantModule::class);
    }
}
