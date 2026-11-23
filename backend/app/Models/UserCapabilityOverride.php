<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;

class UserCapabilityOverride extends Model
{
    use RecordsActivity;

    protected $fillable = ['tenant_id', 'user_id', 'capability', 'effect', 'granted_by'];
}
