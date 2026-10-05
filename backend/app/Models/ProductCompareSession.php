<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductCompareSession extends Model
{
    protected $fillable = [
        'tenant_id',
        'user_id',
        'guest_token',
        'product_ids',
    ];

    protected function casts(): array
    {
        return [
            'product_ids' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
