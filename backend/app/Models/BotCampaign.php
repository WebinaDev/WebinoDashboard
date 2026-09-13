<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BotCampaign extends Model
{
    protected $fillable = [
        'tenant_id',
        'provider',
        'name',
        'status',
        'scheduled_at',
        'type',
        'text',
        'media',
        'audience',
        'user_ids',
        'sent',
        'failed',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'user_ids' => 'array',
            'sent' => 'integer',
            'failed' => 'integer',
        ];
    }
}
