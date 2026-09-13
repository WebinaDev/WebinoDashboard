<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Product extends Model
{
    protected $fillable = [
        'tenant_id',
        'category_id',
        'menu_id',
        'name',
        'slug',
        'description',
        'short_description',
        'image_url',
        'cover_image_url',
        'video_url',
        'video_cover_url',
        'sku',
        'price_minor',
        'sale_price_minor',
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
        'status',
        'type',
        'catalog_visibility',
        'stock_status',
        'manage_stock',
        'weight',
        'length',
        'width',
        'height',
        'gallery',
        'english_name',
        'shipping_time',
        'labels',
        'custom_labels',
        'initial_stock_quantity',
        'ai_review_summary',
        'faqs',
        'purchase_price_minor',
        'lock_price',
        'reference_url',
        'reference_source',
        'reference_last_sync',
        'wholesale_rule',
        'platform_prices',
        'views_count',
        'related_ids',
        'upsell_ids',
        'cross_sell_ids',
    ];

    protected function casts(): array
    {
        return [
            'price_minor' => 'integer',
            'sale_price_minor' => 'integer',
            'purchase_price_minor' => 'integer',
            'stock' => 'integer',
            'is_available' => 'boolean',
            'is_hidden' => 'boolean',
            'is_new' => 'boolean',
            'is_featured' => 'boolean',
            'is_sold_out' => 'boolean',
            'manage_stock' => 'boolean',
            'lock_price' => 'boolean',
            'calories' => 'integer',
            'spice_level' => 'integer',
            'sort_order' => 'integer',
            'discount_percent' => 'integer',
            'shipping_time' => 'integer',
            'initial_stock_quantity' => 'integer',
            'views_count' => 'integer',
            'meta' => 'array',
            'gallery' => 'array',
            'labels' => 'array',
            'custom_labels' => 'array',
            'faqs' => 'array',
            'wholesale_rule' => 'array',
            'platform_prices' => 'array',
            'related_ids' => 'array',
            'upsell_ids' => 'array',
            'cross_sell_ids' => 'array',
            'reference_last_sync' => 'datetime',
            'weight' => 'float',
            'length' => 'float',
            'width' => 'float',
            'height' => 'float',
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

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'category_product');
    }

    public function brands(): BelongsToMany
    {
        return $this->belongsToMany(Brand::class, 'brand_product');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(ProductTag::class, 'product_tag');
    }

    public function attributes(): BelongsToMany
    {
        return $this->belongsToMany(ProductAttribute::class, 'product_attribute_product')
            ->withPivot(['is_visible', 'is_variation', 'position', 'term_ids', 'custom_options']);
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

    public function marketplaceMaps(): HasMany
    {
        return $this->hasMany(MarketplaceProductMap::class);
    }

    public function coffeeProfile(): HasOne
    {
        return $this->hasOne(CoffeeProfile::class);
    }
}
