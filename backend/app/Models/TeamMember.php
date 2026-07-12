<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TeamMember extends Model
{
    protected $fillable = [
        'tenant_id', 'name', 'role', 'bio', 'photo_url', 'social_links', 'sort_order', 'published',
    ];

    protected function casts(): array
    {
        return [
            'social_links' => 'array',
            'published' => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function scopePublished($query)
    {
        return $query->where('published', true)->orderBy('sort_order');
    }
}
