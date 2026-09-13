<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResumeProfile extends Model
{
    protected $fillable = [
        'tenant_id', 'full_name', 'headline', 'summary', 'photo_url',
        'email', 'phone', 'location', 'experience', 'education',
        'skills', 'projects', 'social_links', 'published',
    ];

    protected function casts(): array
    {
        return [
            'experience' => 'array',
            'education' => 'array',
            'skills' => 'array',
            'projects' => 'array',
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
        return $query->where('published', true);
    }
}
