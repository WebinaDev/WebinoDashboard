<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupportKbCategory extends Model
{
    protected $fillable = [
        'tenant_id', 'parent_id', 'name_fa', 'name_en', 'slug',
        'description_fa', 'description_en', 'is_public', 'sort_order',
    ];

    protected function casts(): array
    {
        return ['is_public' => 'boolean'];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function articles(): HasMany
    {
        return $this->hasMany(SupportKbArticle::class, 'category_id');
    }
}
