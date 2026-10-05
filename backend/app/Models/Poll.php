<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Poll extends Model
{
    protected $fillable = [
        'tenant_id',
        'title',
        'options',
        'is_active',
        'closes_at',
    ];

    protected function casts(): array
    {
        return [
            'options' => 'array',
            'is_active' => 'boolean',
            'closes_at' => 'datetime',
        ];
    }

    public function votes(): HasMany
    {
        return $this->hasMany(PollVote::class);
    }
}
