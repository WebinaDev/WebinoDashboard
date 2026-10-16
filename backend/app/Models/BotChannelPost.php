<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BotChannelPost extends Model
{
    protected $fillable = [
        'tenant_id', 'provider', 'channel_id', 'product_id', 'text', 'media_url', 'button_text', 'button_url',
        'status', 'scheduled_at', 'published_at', 'message_id', 'source', 'last_error',
    ];

    protected function casts(): array
    {
        return ['scheduled_at' => 'datetime', 'published_at' => 'datetime'];
    }
}
