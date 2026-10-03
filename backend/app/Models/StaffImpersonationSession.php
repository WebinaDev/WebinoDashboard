<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaffImpersonationSession extends Model
{
    protected $fillable = [
        'personal_access_token_id',
        'staff_id',
        'staff_name',
        'site_id',
        'site_name',
        'domain',
        'customer',
        'sites',
        'return_url',
        'sites_url',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'customer' => 'array',
            'sites' => 'array',
            'expires_at' => 'datetime',
        ];
    }
}
