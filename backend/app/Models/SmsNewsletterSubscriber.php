<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SmsNewsletterSubscriber extends Model
{
    protected $fillable = [
        'tenant_id',
        'phone',
        'product_id',
    ];

    protected function casts(): array
    {
        return [
            'product_id' => 'integer',
        ];
    }
}
