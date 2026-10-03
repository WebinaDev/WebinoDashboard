<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ProductTag extends Model
{
    protected $fillable = [
        'tenant_id',
        'name',
        'slug',
        'status',
        'meta',
    ];

    protected function casts(): array
    {
        return ['meta' => 'array'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'product_tag');
    }
}
