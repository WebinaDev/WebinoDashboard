<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class MagazineTag extends Model
{
    protected $fillable = [
        'tenant_id', 'name', 'slug',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function articles(): BelongsToMany
    {
        return $this->belongsToMany(MagazineArticle::class, 'magazine_article_tag');
    }
}
