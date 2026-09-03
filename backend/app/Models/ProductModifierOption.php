<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductModifierOption extends Model
{
    protected $fillable = [
        'modifier_id',
        'name_fa',
        'name_en',
        'price_minor',
        'is_default',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'price_minor' => 'integer',
            'is_default' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function modifier(): BelongsTo
    {
        return $this->belongsTo(ProductModifier::class, 'modifier_id');
    }
}
