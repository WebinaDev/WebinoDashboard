<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CafeBranch extends Model
{
    protected $fillable = [
        'tenant_id',
        'name_fa',
        'name_en',
        'slug',
        'address_fa',
        'address_en',
        'phone',
        'is_active',
        'sort_order',
    ];

    protected static function booted(): void
    {
        // name_en is NOT NULL; branches created with only a Persian name (seeders, imports) fall back to it.
        static::creating(function (self $branch) {
            if (blank($branch->name_en)) {
                $branch->name_en = (string) ($branch->name_fa ?: $branch->slug ?: '');
            }
        });
    }

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
