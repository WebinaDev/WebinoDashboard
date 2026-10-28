<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketingPopup extends Model
{
    protected $fillable = ['tenant_id', 'name', 'status', 'priority', 'content', 'trigger', 'trigger_value', 'targeting', 'display', 'starts_at', 'ends_at'];

    protected $casts = [
        'content' => 'array',
        'targeting' => 'array',
        'display' => 'array',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
    ];
}
