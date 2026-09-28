<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SmsSecretaryLog extends Model
{
    protected $fillable = [
        'tenant_id',
        'inbox_id',
        'rule_id',
        'phone',
        'ok',
        'error',
    ];

    protected function casts(): array
    {
        return [
            'ok' => 'boolean',
        ];
    }
}
