<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportSlaPolicy extends Model
{
    protected $fillable = [
        'tenant_id', 'name_fa', 'name_en', 'department_id', 'priority',
        'first_response_minutes', 'resolve_minutes', 'business_hours_only',
        'alert_before_minutes', 'escalate_to_user_id', 'is_active', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'business_hours_only' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(SupportDepartment::class, 'department_id');
    }

    public function escalateTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'escalate_to_user_id');
    }
}
