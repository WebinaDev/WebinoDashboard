<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NewsletterSubscriber extends Model
{
    protected $fillable = [
        'tenant_id',
        'email',
        'phone',
        'source',
        'status',
        'ip_hash',
    ];
}
