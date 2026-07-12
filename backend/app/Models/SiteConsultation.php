<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SiteConsultation extends Model
{
    protected $fillable = [
        'tenant_id', 'name', 'email', 'phone', 'subject', 'message', 'status',
        'erp_consultation_id', 'synced_at', 'meta',
    ];

    protected function casts(): array
    {
        return [
            'synced_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
