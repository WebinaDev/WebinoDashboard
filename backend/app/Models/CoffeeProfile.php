<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoffeeProfile extends Model
{
    protected $fillable = [
        'tenant_id',
        'product_id',
        'visible',
        'blend_robusta',
        'blend_arabica',
        'acidity',
        'caffeine_mg',
        'bitterness',
        'sweetness',
        'body',
        'pack_weight_g',
        'price_mode',
        'price_parts',
        'origin_ids',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'visible' => 'array',
            'acidity' => 'array',
            'price_parts' => 'array',
            'origin_ids' => 'array',
            'meta' => 'array',
            'blend_robusta' => 'integer',
            'blend_arabica' => 'integer',
            'caffeine_mg' => 'integer',
            'bitterness' => 'integer',
            'sweetness' => 'integer',
            'body' => 'integer',
            'pack_weight_g' => 'integer',
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
