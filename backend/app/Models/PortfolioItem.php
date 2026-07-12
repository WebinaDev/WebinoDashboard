<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PortfolioItem extends Model
{
    protected $fillable = [
        'tenant_id', 'slug', 'title', 'description', 'images', 'category', 'client',
        'published', 'published_at',
    ];

    protected function casts(): array
    {
        return [
            'images' => 'array',
            'published' => 'boolean',
            'published_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function scopePublished($query)
    {
        return $query->where('published', true);
    }
}
