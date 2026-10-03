<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ErpAnnouncement extends Model
{
    protected $fillable = [
        'tenant_id',
        'source_id',
        'title',
        'body',
        'audience',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function reads(): HasMany
    {
        return $this->hasMany(ErpAnnouncementRead::class, 'announcement_id');
    }
}
