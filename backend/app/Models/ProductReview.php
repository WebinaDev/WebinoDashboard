<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductReview extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_SPAM = 'spam';

    public const STATUS_TRASH = 'trash';

    /** @var list<string> */
    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_SPAM,
        self::STATUS_TRASH,
    ];

    protected $fillable = [
        'tenant_id',
        'product_id',
        'user_id',
        'rating',
        'body',
        'voice_path',
        'likes_count',
        'dislikes_count',
        'admin_reply',
        'author_name',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'rating' => 'integer',
        ];
    }

    public static function normalizeStoredStatus(?string $status): string
    {
        $status = strtolower(trim((string) $status));
        if ($status === 'hold') {
            return self::STATUS_PENDING;
        }
        if ($status === 'rejected') {
            return self::STATUS_SPAM;
        }
        if (in_array($status, self::STATUSES, true)) {
            return $status;
        }

        return self::STATUS_PENDING;
    }

    public static function normalizeIncomingStatus(string $status): string
    {
        return self::normalizeStoredStatus($status);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
