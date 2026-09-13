<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceProductMap extends Model
{
    protected $fillable = [
        'tenant_id',
        'product_id',
        'product_variant_id',
        'platform',
        'remote_product_id',
        'remote_variant_id',
        'remote_url',
        'sync_enabled',
        'last_sync_at',
        'last_error',
        'remote_price',
        'remote_stock',
    ];

    protected function casts(): array
    {
        return [
            'sync_enabled' => 'boolean',
            'last_sync_at' => 'datetime',
            'remote_price' => 'integer',
            'remote_stock' => 'integer',
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

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}
