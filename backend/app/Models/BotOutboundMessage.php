<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BotOutboundMessage extends Model
{
    protected $fillable = ['tenant_id', 'provider', 'chat_id', 'method', 'payload', 'status', 'attempts', 'last_error', 'next_attempt_at'];

    protected function casts(): array
    {
        return ['payload' => 'array', 'attempts' => 'integer', 'next_attempt_at' => 'datetime'];
    }
}
