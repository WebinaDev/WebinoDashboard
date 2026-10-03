<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class MagazineCategory extends Model
{
    protected $fillable = [
        'tenant_id', 'name', 'slug', 'parent_id', 'description', 'seo', 'status', 'meta',
    ];

    protected function casts(): array
    {
        return ['seo' => 'array', 'meta' => 'array'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function articles(): BelongsToMany
    {
        return $this->belongsToMany(MagazineArticle::class, 'magazine_article_category');
    }
}
