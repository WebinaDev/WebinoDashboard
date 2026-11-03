<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupportDepartment extends Model
{
    protected $fillable = [
        'tenant_id',
        'name_fa',
        'name_en',
        'slug',
        'description_fa',
        'description_en',
        'color',
        'icon',
        'default_priority',
        'default_assignee_id',
        'sla_first_response_hours',
        'sla_resolve_hours',
        'is_active',
        'sort_order',
        'form_fields',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'form_fields' => 'array',
            'sla_first_response_hours' => 'integer',
            'sla_resolve_hours' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function defaultAssignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'default_assignee_id');
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(SupportTicket::class, 'department_id');
    }

    public function cannedResponses(): HasMany
    {
        return $this->hasMany(SupportCannedResponse::class, 'department_id');
    }
}
