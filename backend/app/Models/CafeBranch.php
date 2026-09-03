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

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
