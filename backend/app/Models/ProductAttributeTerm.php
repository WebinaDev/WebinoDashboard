<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductAttributeTerm extends Model
{
    protected $fillable = [
        'tenant_id',
        'product_attribute_id',
        'name',
        'slug',
        'description',
        'menu_order',
        'color',
        'image_url',
    ];

    protected function casts(): array
    {
        return [
            'menu_order' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function attribute(): BelongsTo
    {
        return $this->belongsTo(ProductAttribute::class, 'product_attribute_id');
    }
}
