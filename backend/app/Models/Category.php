<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    protected $fillable = [
        'tenant_id',
        'parent_id',
        'name',
        'slug',
        'description',
        'icon_url',
        'image_url',
        'sort_order',
        'display_mode',
        'cover_image_url',
        'thumbnail_id',
        'views_count',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'views_count' => 'integer',
            'thumbnail_id' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Category::class, 'parent_id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function productsMany(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'category_product');
    }
}
