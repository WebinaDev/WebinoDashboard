<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductFeedback extends Model
{
    protected $table = 'product_feedback';

    protected $fillable = [
        'tenant_id',
        'product_id',
        'rating',
        'comment',
        'guest_phone',
        'fingerprint',
    ];

    protected function casts(): array
    {
        return [
            'rating' => 'integer',
        ];
    }
}
