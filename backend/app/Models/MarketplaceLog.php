<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketplaceLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'tenant_id',
        'platform',
        'level',
        'channel',
        'message',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'meta' => 'array',
        ];
    }
}
