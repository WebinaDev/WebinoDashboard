<?php

namespace App\Models\Poetry;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use App\Services\Poetry\PoetryText;

class PoetryPoem extends Model
{
    protected $table = 'poetry_poems';

    protected $fillable = ['tenant_id', 'slug', 'title', 'excerpt', 'occasion_id', 'meter_id', 'style_label', 'pen_name', 'composed_label', 'melody_credit', 'flags',
        'refrain_after_each', 'media_ids', 'external_links', 'seo', 'status', 'published_at'];

    protected $casts = ['flags' => 'array', 'media_ids' => 'array', 'external_links' => 'array', 'seo' => 'array',
        'refrain_after_each' => 'boolean', 'published_at' => 'datetime', 'view_count' => 'integer'];

    protected $hidden = ['search_text'];

    protected static function booted(): void
    {
        \App\Services\Poetry\PoetryScope::boot(static::class);
    }

    public function stanzas()
    {
        return $this->hasMany(PoetryStanza::class, 'poem_id')->orderBy('position');
    }

    /** Standalone media items linked to this poem (poetry_media.poem_id). */
    public function mediaItems()
    {
        return $this->hasMany(PoetryMedia::class, 'poem_id')->orderBy('sort')->orderBy('id');
    }

    public function terms()
    {
        return $this->belongsToMany(PoetryTerm::class, 'poetry_poem_term', 'poem_id', 'term_id');
    }

    public function occasion()
    {
        return $this->belongsTo(PoetryTerm::class, 'occasion_id');
    }

    public function meter()
    {
        return $this->belongsTo(PoetryTerm::class, 'meter_id');
    }

    public function scopePublished(Builder $q): Builder
    {
        return $q->where('status', 'published')->where(fn ($w) => $w->whereNull('published_at')->orWhere('published_at', '<=', now()));
    }

    public function refreshSearchText(): void
    {
        $lines = $this->stanzas()->get()->flatMap(fn ($s) => $s->lines ?? [])->all();
        $this->forceFill(['search_text' => PoetryText::normalize($this->title.' '.implode(' ', $lines))])->saveQuietly();
    }
}
