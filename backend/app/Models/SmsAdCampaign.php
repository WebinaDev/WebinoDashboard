<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SmsAdCampaign extends Model
{
    public const STATUS_SCHEDULED = 'scheduled';

    public const STATUS_SENDING = 'sending';

    public const STATUS_SENT = 'sent';

    public const STATUS_FAILED = 'failed';

    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'tenant_id',
        'public_id',
        'name',
        'segment',
        'channel',
        'message',
        'product_id',
        'category_id',
        'content_type',
        'coupon_code',
        'scheduled_at',
        'status',
        'recipient_count',
        'phones',
        'sent',
        'failed',
        'cost',
        'bulk_ids',
        'utm_campaign',
        'created_by',
        'error',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'phones' => 'array',
            'bulk_ids' => 'array',
            'cost' => 'float',
            'recipient_count' => 'integer',
            'sent' => 'integer',
            'failed' => 'integer',
            'product_id' => 'integer',
            'category_id' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
