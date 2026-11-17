<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A 3D recording of an item: either a glTF/GLB model shown with <model-viewer> or a 360°
 * turntable set (frames captured front-to-back) the storefront can spin with a drag.
 */
class ProductGalleryView extends Model
{
    protected $fillable = [
        'tenant_id',
        'product_id',
        'type',
        'url',
        'poster_url',
        'frames',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'frames' => 'integer',
            'sort_order' => 'integer',
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
