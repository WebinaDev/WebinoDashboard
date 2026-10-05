<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PollVote extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'poll_id',
        'user_id',
        'guest_token',
        'option_index',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'option_index' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function poll(): BelongsTo
    {
        return $this->belongsTo(Poll::class);
    }
}
