<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductReport extends Model
{
    public const TYPE_LOWER_PRICE = 'lower_price';

    public const TYPE_ISSUE = 'issue';

    public const TYPES = [self::TYPE_LOWER_PRICE, self::TYPE_ISSUE];

    public const ISSUE_KINDS = ['wrong_info', 'wrong_price', 'image', 'unavailable', 'other'];

    public const STATUSES = ['new', 'reviewed', 'resolved', 'rejected'];

    protected $fillable = [
        'tenant_id', 'product_id', 'user_id', 'type', 'issue_kind', 'name', 'contact',
        'competitor_url', 'competitor_price_minor', 'message', 'status', 'admin_note', 'ip',
    ];

    protected $hidden = ['ip'];

    protected function casts(): array
    {
        return ['competitor_price_minor' => 'integer'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
