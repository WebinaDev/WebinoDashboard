<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GuestPhoneRegistration extends Model
{
    protected $fillable = [
        'tenant_id',
        'phone',
        'fingerprint',
    ];
}
