<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportTicketReply extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'ticket_id',
        'user_id',
        'is_staff',
        'body',
        'attachments',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'is_staff' => 'boolean',
            'attachments' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(SupportTicket::class, 'ticket_id');
    }
}
