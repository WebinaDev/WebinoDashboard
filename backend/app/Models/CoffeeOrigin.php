<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoffeeOrigin extends Model
{
    protected $fillable = [
        'tenant_id',
        'name',
        'slug',
        'iso_code',
        'image_url',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
