<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserCapabilityOverride extends Model
{
    protected $fillable = ['tenant_id', 'user_id', 'capability', 'effect', 'granted_by'];
}
