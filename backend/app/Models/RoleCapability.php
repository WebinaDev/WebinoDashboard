<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;

class RoleCapability extends Model
{
    use RecordsActivity;

    protected $fillable = [
        'tenant_id',
        'role',
        'capability',
    ];
}
