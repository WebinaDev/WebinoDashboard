<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VendorStore extends Model
{
    protected $fillable = [
        'tenant_id',
        'user_id',
        'name',
        'slug',
        'bio',
        'logo_url',
        'status',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'meta' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function withdrawals(): HasMany
    {
        return $this->hasMany(VendorWithdrawal::class);
    }
}
