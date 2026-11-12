<?php

namespace App\Models\Poetry;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/** A collection of poems published as a book (cover, description, ordered poems). Tenant-scoped via PoetryScope. */
class PoetryBook extends Model
{
    protected $table = 'poetry_books';

    protected $fillable = ['tenant_id', 'slug', 'title', 'subtitle', 'description', 'cover', 'publisher', 'published_label', 'pages', 'isbn',
        'product_id', 'purchase_url', 'cta_label', 'is_premium', 'sort', 'status', 'seo'];

    protected $casts = ['pages' => 'integer', 'product_id' => 'integer', 'is_premium' => 'boolean', 'sort' => 'integer', 'seo' => 'array'];

    protected $attributes = ['status' => 'published', 'sort' => 0, 'is_premium' => false];

    protected static function booted(): void
    {
        \App\Services\Poetry\PoetryScope::boot(static::class);
    }

    public function poems()
    {
        return $this->belongsToMany(PoetryPoem::class, 'poetry_book_poem', 'book_id', 'poem_id')->withPivot('position')->orderBy('poetry_book_poem.position');
    }

    public function scopePublished(Builder $q): Builder
    {
        return $q->where('status', 'published');
    }
}
