<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RoleCapability extends Model
{
    protected $fillable = [
        'tenant_id',
        'role',
        'capability',
    ];
}
