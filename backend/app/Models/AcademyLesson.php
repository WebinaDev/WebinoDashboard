<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AcademyLesson extends Model
{
    protected $fillable = [
        'course_id', 'slug', 'title', 'content', 'video_url', 'sort_order', 'published',
    ];

    protected function casts(): array
    {
        return ['published' => 'boolean'];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(AcademyCourse::class, 'course_id');
    }
}
