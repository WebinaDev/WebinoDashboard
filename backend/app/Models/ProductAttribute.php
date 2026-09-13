<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductAttribute extends Model
{
    protected $fillable = [
        'tenant_id',
        'name',
        'slug',
        'type',
        'order_by',
        'has_archives',
        'show_swatch_label',
    ];

    protected function casts(): array
    {
        return [
            'has_archives' => 'boolean',
            'show_swatch_label' => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function terms(): HasMany
    {
        return $this->hasMany(ProductAttributeTerm::class)->orderBy('menu_order')->orderBy('name');
    }
}
