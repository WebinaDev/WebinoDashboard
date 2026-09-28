<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SmsDraft extends Model
{
    protected $fillable = [
        'tenant_id',
        'title',
        'body',
        'recipients',
    ];

    protected function casts(): array
    {
        return [
            'recipients' => 'array',
        ];
    }
}
