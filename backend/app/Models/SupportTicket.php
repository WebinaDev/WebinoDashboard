<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupportTicket extends Model
{
    protected $fillable = [
        'tenant_id',
        'user_id',
        'subject',
        'status',
        'assignee_id',
        'erp_ticket_id',
        'converted_task_id',
        'csat_rating',
        'csat_at',
    ];

    protected function casts(): array
    {
        return [
            'csat_rating' => 'integer',
            'csat_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function replies(): HasMany
    {
        return $this->hasMany(SupportTicketReply::class, 'ticket_id')->orderBy('id');
    }
}
