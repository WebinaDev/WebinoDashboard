<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * How much of one item a branch has on hand.
 *
 * `quantity` is signed. An offline sale that could not see the current figure is still
 * recorded — the money was taken and the guest has left — so the branch can read negative
 * until someone counts the shelf. Hiding that behind an unsigned column would make the
 * shortfall disappear instead of flagging it.
 */
class BranchStock extends Model
{
    use RecordsActivity;

    protected $table = 'branch_stock';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'product_id',
        'product_variant_id',
        'quantity',
        'reserved_quantity',
        'reorder_level',
        'last_counted_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'reserved_quantity' => 'integer',
            'reorder_level' => 'integer',
            'last_counted_at' => 'datetime',
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

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /** What can actually be sold right now. */
    public function available(): int
    {
        return $this->quantity - $this->reserved_quantity;
    }

    public function isBelowReorder(): bool
    {
        return $this->reorder_level !== null && $this->quantity <= $this->reorder_level;
    }
}
