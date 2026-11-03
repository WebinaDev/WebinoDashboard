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
        'guest_name',
        'guest_email',
        'guest_phone',
        'department_id',
        'referred_from_department_id',
        'subject',
        'status',
        'priority',
        'source',
        'ticket_number',
        'form_values',
        'tags',
        'assignee_id',
        'erp_ticket_id',
        'converted_task_id',
        'csat_rating',
        'csat_at',
        'first_response_at',
        'resolve_due_at',
        'sla_policy_id',
        'first_response_due_at',
        'sla_breached_at',
        'sla_breach_type',
        'sla_alerted_at',
        'resolved_at',
        'csat_campaign_id',
        'csat_token',
        'csat_requested_at',
        'csat_comment',
    ];

    protected function casts(): array
    {
        return [
            'csat_rating' => 'integer',
            'csat_at' => 'datetime',
            'form_values' => 'array',
            'tags' => 'array',
            'first_response_at' => 'datetime',
            'resolve_due_at' => 'datetime',
            'first_response_due_at' => 'datetime',
            'sla_breached_at' => 'datetime',
            'sla_alerted_at' => 'datetime',
            'resolved_at' => 'datetime',
            'csat_requested_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(SupportDepartment::class, 'department_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(SupportTicketReply::class, 'ticket_id')->orderBy('id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(SupportTicketEvent::class, 'ticket_id')->orderBy('id');
    }
}
