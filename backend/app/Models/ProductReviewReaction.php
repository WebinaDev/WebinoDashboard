<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductReviewReaction extends Model
{
    protected $fillable = [
        'review_id',
        'user_id',
        'guest_token',
        'reaction',
    ];

    public function review(): BelongsTo
    {
        return $this->belongsTo(ProductReview::class, 'review_id');
    }
}
