<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductDownload extends Model
{
    protected $fillable = [
        'tenant_id',
        'product_id',
        'name',
        'storage_path',
        'original_name',
        'download_limit',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'download_limit' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
