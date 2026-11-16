<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A saved «برگه بهای تمام‌شده» for one menu item: the ingredients, packaging, labour and
 * overhead that produced a suggested price, plus the snapshot of what the calculator said.
 *
 * Keeping the breakdown means a price already on the menu can always be traced back to the
 * cost sheet that justified it — useful when coffee or dairy prices move and the whole menu
 * has to be re-derived.
 */
class CafePriceSheet extends Model
{
    protected $fillable = [
        'tenant_id',
        'product_id',
        'name',
        'ingredient_cost_minor',
        'packaging_cost_minor',
        'labour_cost_minor',
        'fixed_cost_minor',
        'waste_percent',
        'target_profit_percent',
        'platform_commission_percent',
        'vat_percent',
        'suggested_dine_in_minor',
        'suggested_delivery_minor',
        'applied_price_minor',
        'breakdown',
    ];

    protected function casts(): array
    {
        return [
            'ingredient_cost_minor' => 'integer',
            'packaging_cost_minor' => 'integer',
            'labour_cost_minor' => 'integer',
            'fixed_cost_minor' => 'integer',
            'waste_percent' => 'float',
            'target_profit_percent' => 'float',
            'platform_commission_percent' => 'float',
            'vat_percent' => 'float',
            'suggested_dine_in_minor' => 'integer',
            'suggested_delivery_minor' => 'integer',
            'applied_price_minor' => 'integer',
            'breakdown' => 'array',
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
