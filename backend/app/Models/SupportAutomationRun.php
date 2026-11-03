<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportAutomationRun extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'tenant_id', 'rule_id', 'ticket_id', 'status', 'event_payload',
        'result_payload', 'error', 'started_at', 'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'event_payload' => 'array',
            'result_payload' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(SupportAutomationRule::class, 'rule_id');
    }
}
