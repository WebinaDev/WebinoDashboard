<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BulkPriceJob extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_RUNNING = 'running';

    public const STATUS_PAUSED = 'paused';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_DONE = 'done';

    public const STATUS_FAILED = 'failed';

    public const STAGE_PENDING = 'pending';

    public const STAGE_COUNTING = 'counting';

    public const STAGE_APPLYING = 'applying';

    public const STAGE_FINALIZING = 'finalizing';

    public const STAGE_DONE = 'done';

    protected $fillable = [
        'tenant_id',
        'status',
        'stage',
        'cursor_product_id',
        'params',
        'state',
        'last_log',
        'locked',
        'locked_at',
    ];

    protected function casts(): array
    {
        return [
            'params' => 'array',
            'state' => 'array',
            'locked' => 'boolean',
            'locked_at' => 'datetime',
            'cursor_product_id' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(BulkPriceJobItem::class);
    }

    public function isActive(): bool
    {
        return in_array($this->status, [self::STATUS_PENDING, self::STATUS_RUNNING], true);
    }

    public function isControllable(): bool
    {
        return in_array($this->status, [
            self::STATUS_PENDING,
            self::STATUS_RUNNING,
            self::STATUS_PAUSED,
        ], true);
    }
}
