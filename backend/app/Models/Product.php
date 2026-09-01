<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'tenant_id',
        'category_id',
        'name',
        'slug',
        'description',
        'image_url',
        'sku',
        'price_minor',
        'currency',
        'stock',
        'is_available',
        'is_hidden',
        'is_new',
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

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('sort_order');
    }
}
