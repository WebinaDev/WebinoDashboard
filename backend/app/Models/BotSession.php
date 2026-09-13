<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BotSession extends Model
{
    protected $fillable = [
        'tenant_id',
        'provider',
        'chat_id',
        'user_id',
        'last_seen_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
