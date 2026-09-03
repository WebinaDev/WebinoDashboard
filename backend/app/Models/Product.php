<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'tenant_id',
        'category_id',
        'menu_id',
        'name',
        'slug',
        'description',
        'image_url',
        'cover_image_url',
        'video_url',
        'sku',
        'price_minor',
        'currency',
        'stock',
        'is_available',
        'is_hidden',
        'is_new',
        'is_featured',
        'is_sold_out',
        'calories',
        'spice_level',
        'sort_order',
        'discount_percent',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'price_minor' => 'integer',
            'stock' => 'integer',
            'is_available' => 'boolean',
            'is_hidden' => 'boolean',
            'is_new' => 'boolean',
            'is_featured' => 'boolean',
            'is_sold_out' => 'boolean',
            'calories' => 'integer',
            'spice_level' => 'integer',
            'sort_order' => 'integer',
            'discount_percent' => 'integer',
            'meta' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function menu(): BelongsTo
    {
        return $this->belongsTo(Menu::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('sort_order');
    }

    public function media(): HasMany
    {
        return $this->hasMany(ProductMedia::class)->orderBy('sort_order');
    }

    public function allergens(): BelongsToMany
    {
        return $this->belongsToMany(Allergen::class, 'product_allergen');
    }

    public function modifiers(): HasMany
    {
        return $this->hasMany(ProductModifier::class)->orderBy('sort_order');
    }

    public function likes(): HasMany
    {
        return $this->hasMany(ProductLike::class);
    }
}
