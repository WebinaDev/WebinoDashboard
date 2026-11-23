<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A branch's own price and availability for a shared catalogue item.
 *
 * A null `price_minor` means "inherit the product price" — that is the common case and it
 * is why a price change on the product reaches every branch that never overrode it.
 */
class BranchProductPrice extends Model
{
    use RecordsActivity;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'product_id',
        'product_variant_id',
        'price_minor',
        'sale_price_minor',
        'is_available',
    ];

    protected function casts(): array
    {
        return [
            'price_minor' => 'integer',
            'sale_price_minor' => 'integer',
            'is_available' => 'boolean',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
