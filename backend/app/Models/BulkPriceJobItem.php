<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BulkPriceJobItem extends Model
{
    protected $fillable = [
        'bulk_price_job_id',
        'product_id',
        'status',
        'stage',
        'reason',
        'before',
        'after',
    ];

    protected function casts(): array
    {
        return [
            'before' => 'array',
            'after' => 'array',
        ];
    }

    public function job(): BelongsTo
    {
        return $this->belongsTo(BulkPriceJob::class, 'bulk_price_job_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
