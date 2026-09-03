<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductLike extends Model
{
    protected $fillable = [
        'tenant_id',
        'product_id',
        'fingerprint',
    ];
}
