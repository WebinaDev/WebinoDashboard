<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductVariant extends Model
{
    protected $fillable = [
        'tenant_id',
        'product_id',
        'name',
        'sku',
        'price_minor',
        'sale_price_minor',
        'purchase_price_minor',
        'lock_price',
        'stock',
        'stock_status',
        'manage_stock',
        'attribute_values',
        'image_url',
        'weight',
        'length',
        'width',
        'height',
        'wholesale_rule',
        'reference_url',
        'platform_prices',
        'is_default',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'price_minor' => 'integer',
            'sale_price_minor' => 'integer',
            'purchase_price_minor' => 'integer',
            'stock' => 'integer',
            'lock_price' => 'boolean',
            'manage_stock' => 'boolean',
            'is_default' => 'boolean',
            'sort_order' => 'integer',
            'attribute_values' => 'array',
            'wholesale_rule' => 'array',
            'platform_prices' => 'array',
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

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
