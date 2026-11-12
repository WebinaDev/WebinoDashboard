<?php

namespace App\Models\Poetry;

use App\Models\MediaAsset;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/** Story-like highlight: an image or a (16:9) video with title, cover and optional link. Tenant-scoped via PoetryScope. */
class PoetryHighlight extends Model
{
    protected $table = 'poetry_highlights';

    public const KINDS = ['image', 'video'];

    protected $fillable = ['tenant_id', 'title', 'kind', 'media_id', 'file_url', 'external_url', 'cover', 'link_url', 'link_label', 'duration', 'is_premium', 'sort', 'status'];

    protected $casts = ['media_id' => 'integer', 'is_premium' => 'boolean', 'sort' => 'integer'];

    protected $attributes = ['status' => 'published', 'sort' => 0, 'is_premium' => false, 'kind' => 'image'];

    protected static function booted(): void
    {
        \App\Services\Poetry\PoetryScope::boot(static::class);
    }

    public function asset()
    {
        return $this->belongsTo(MediaAsset::class, 'media_id');
    }

    public function scopePublished(Builder $q): Builder
    {
        return $q->where('status', 'published');
    }
}
