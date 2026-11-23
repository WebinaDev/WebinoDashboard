<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OrderItem extends Model
{
    /**
     * Purchase cost is commercial-in-confidence: it must never reach a storefront, a guest
     * order history, or a till response. Hiding it at the model means a future endpoint that
     * serialises items cannot leak it by accident.
     */
    protected $hidden = [
        'unit_cost_minor',
    ];

    protected $fillable = [
        'order_id',
        'product_id',
        'product_variant_id',
        'product_name',
        'sku',
        'quantity',
        'unit_price_minor',
        // Cost captured at the moment of sale, so cost of goods is valued at what the goods
        // actually cost that day rather than at today's supplier price.
        'unit_cost_minor',
        'modifier_delta_minor',
        'purchase_type',
        'meta',
        'download_count',
        'requires_login',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price_minor' => 'integer',
            'unit_cost_minor' => 'integer',
            'modifier_delta_minor' => 'integer',
            'meta' => 'array',
            'download_count' => 'integer',
            'requires_login' => 'boolean',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /** Add-ons chosen for this line, frozen with their price at the moment of sale. */
    public function modifiers(): HasMany
    {
        return $this->hasMany(OrderItemModifier::class, 'order_item_id')->orderBy('id');
    }
}
