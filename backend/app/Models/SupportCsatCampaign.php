<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportCsatCampaign extends Model
{
    protected $fillable = [
        'tenant_id', 'name_fa', 'name_en', 'question_fa', 'question_en',
        'thank_you_fa', 'thank_you_en', 'delay_minutes', 'channels',
        'is_active', 'is_default',
    ];

    protected function casts(): array
    {
        return [
            'channels' => 'array',
            'is_active' => 'boolean',
            'is_default' => 'boolean',
        ];
    }
}
