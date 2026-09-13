<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BotBroadcastJob extends Model
{
    protected $fillable = [
        'tenant_id',
        'provider',
        'active',
        'status',
        'type',
        'text',
        'media',
        'segment',
        'campaign_id',
        'total',
        'sent',
        'failed',
        'cursor',
        'chat_ids',
        'last_error',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'chat_ids' => 'array',
            'total' => 'integer',
            'sent' => 'integer',
            'failed' => 'integer',
            'cursor' => 'integer',
        ];
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(BotCampaign::class, 'campaign_id');
    }
}
