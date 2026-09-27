<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RoleCapability extends Model
{
    protected $fillable = [
        'role',
        'capability',
    ];
}
