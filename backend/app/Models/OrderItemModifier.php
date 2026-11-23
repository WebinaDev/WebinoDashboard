<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One add-on chosen for one line: "latte + oat milk + extra shot".
 *
 * The name and price are frozen at the till. A menu edit — renaming an option, changing its
 * surcharge, removing it entirely — must not rewrite what a guest was charged last week, and
 * the option row itself may be deleted from under us.
 */
class OrderItemModifier extends Model
{
    protected $fillable = [
        'order_item_id',
        'modifier_option_id',
        'name',
        'price_delta_minor',
        'quantity',
    ];

    protected function casts(): array
    {
        return [
            'price_delta_minor' => 'integer',
            'quantity' => 'integer',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class, 'order_item_id');
    }

    public function option(): BelongsTo
    {
        return $this->belongsTo(ProductModifierOption::class, 'modifier_option_id');
    }
}
