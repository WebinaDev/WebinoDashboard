<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AcademyCourse extends Model
{
    protected $fillable = [
        'tenant_id', 'slug', 'title', 'description', 'cover_url', 'published', 'sort_order',
    ];

    protected function casts(): array
    {
        return ['published' => 'boolean'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function lessons(): HasMany
    {
        return $this->hasMany(AcademyLesson::class, 'course_id')->orderBy('sort_order');
    }

    public function scopePublished($query)
    {
        return $query->where('published', true);
    }
}
