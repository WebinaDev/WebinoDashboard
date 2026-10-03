<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CmsPage extends Model
{
    protected $fillable = [
        'tenant_id',
        'parent_id',
        'slug',
        'title',
        'excerpt',
        'body',
        'builder_draft',
        'builder_published',
        'published',
        'status',
        'featured_media_id',
        'comment_status',
        'visibility',
        'password',
        'seo',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'published' => 'boolean',
            'seo' => 'array',
            'meta' => 'array',
            'builder_draft' => 'array',
            'builder_published' => 'array',
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

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }
}
