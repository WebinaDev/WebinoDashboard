<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BotMessageLog extends Model
{
    protected $fillable = [
        'tenant_id',
        'provider',
        'chat_id',
        'direction',
        'type',
        'payload',
        'status',
    ];
}
