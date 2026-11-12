<?php

namespace App\Models\Membership;

use App\Models\Product;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A premium membership plan (duration + price). Sold through a linked shop product. */
class MembershipPlan extends Model
{
    public const UNITS = ['day', 'month', 'year'];

    protected $fillable = ['tenant_id', 'name', 'slug', 'description', 'duration_value', 'duration_unit', 'price_minor', 'sale_price_minor',
        'currency', 'product_id', 'badge', 'is_featured', 'is_active', 'sort', 'meta'];

    protected $attributes = ['is_active' => true, 'is_featured' => false, 'sort' => 0, 'duration_value' => 1, 'duration_unit' => 'month', 'price_minor' => 0];

    protected $casts = ['duration_value' => 'integer', 'price_minor' => 'integer', 'sale_price_minor' => 'integer', 'product_id' => 'integer',
        'is_featured' => 'boolean', 'is_active' => 'boolean', 'sort' => 'integer', 'meta' => 'array'];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function effectivePriceMinor(): int
    {
        $sale = $this->sale_price_minor;

        return $sale !== null && $sale > 0 && $sale < $this->price_minor ? (int) $sale : (int) $this->price_minor;
    }
}
