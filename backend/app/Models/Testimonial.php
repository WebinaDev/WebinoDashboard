<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Testimonial extends Model
{
    protected $fillable = [
        'tenant_id', 'author', 'role', 'company', 'quote', 'rating', 'avatar_url',
        'published', 'sort_order',
    ];

    protected function casts(): array
    {
        return ['published' => 'boolean'];
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
