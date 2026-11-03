<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportKbArticle extends Model
{
    protected $fillable = [
        'tenant_id', 'category_id', 'title_fa', 'title_en', 'slug',
        'body_fa', 'body_en', 'excerpt_fa', 'excerpt_en', 'tags',
        'is_published', 'is_public', 'show_in_widget', 'view_count',
        'helpful_yes', 'helpful_no', 'author_id', 'published_at',
    ];

    protected function casts(): array
    {
        return [
            'tags' => 'array',
            'is_published' => 'boolean',
            'is_public' => 'boolean',
            'show_in_widget' => 'boolean',
            'published_at' => 'datetime',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(SupportKbCategory::class, 'category_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}
