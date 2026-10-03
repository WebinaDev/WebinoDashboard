<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class MagazineArticle extends Model
{
    protected $fillable = [
        'tenant_id',
        'slug',
        'title',
        'excerpt',
        'body',
        'cover_url',
        'featured_media_id',
        'status',
        'published_at',
        'comment_status',
        'visibility',
        'password',
        'seo',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'published_at' => 'datetime',
            'seo' => 'array',
            'meta' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function featuredMedia(): BelongsTo
    {
        return $this->belongsTo(MediaAsset::class, 'featured_media_id');
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(MagazineCategory::class, 'magazine_article_category');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(MagazineTag::class, 'magazine_article_tag');
    }

    public function scopePublished($query)
    {
        return $query->where('status', 'published')
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now());
    }
}
