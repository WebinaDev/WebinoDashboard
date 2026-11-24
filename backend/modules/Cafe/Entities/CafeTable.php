<?php

namespace Modules\Cafe\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CafeTable extends Model
{
    use \App\Support\Audit\RecordsActivity;

    public const STATUS_FREE = 'free';
    public const STATUS_SEATED = 'seated';
    public const STATUS_ORDERING = 'ordering';
    public const STATUS_SERVED = 'served';
    public const STATUS_CLEANING = 'cleaning';
    public const STATUS_RESERVED = 'reserved';

    /** Statuses where guests are physically at the table. */
    public const OCCUPIED_STATUSES = [self::STATUS_SEATED, self::STATUS_ORDERING, self::STATUS_SERVED];

    public const STATUSES = [
        self::STATUS_FREE,
        self::STATUS_SEATED,
        self::STATUS_ORDERING,
        self::STATUS_SERVED,
        self::STATUS_CLEANING,
        self::STATUS_RESERVED,
    ];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'code',
        'label',
        // Which room: `سالن اصلی`, `تراس`, `بار`. A free label, because shops name their own.
        'area',
        'seats',
        'is_active',
        'sort_order',
        'status',
        'status_changed_at',
        'active_order_id',
        'reservation_name',
        'reserved_for_at',
    ];

    protected function casts(): array
    {
        return [
            'seats' => 'integer',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
            'status_changed_at' => 'datetime',
            'reserved_for_at' => 'datetime',
            'active_order_id' => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }

    public function activeOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'active_order_id');
    }

    public function isOccupied(): bool
    {
        return in_array((string) $this->status, self::OCCUPIED_STATUSES, true);
    }
}
