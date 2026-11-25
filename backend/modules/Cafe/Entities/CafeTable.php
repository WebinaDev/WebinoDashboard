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

    /**
     * Two states the floor board could see but never name.
     *
     * `awaiting_settlement` (منتظر تسویه): the guests have eaten and nothing is on its way to the
     * kitchen, so the only thing left is the bill. Without the name the waiter had to read every
     * order to tell it apart from a table that is still eating — and the one table the till is
     * waiting on looked exactly like the nine it is not.
     *
     * `overdue` (دیرکرد): the same table, still open long after it should have been paid. This is
     * derived, never stored: it is a fact about time, not a state somebody sets, and storing it
     * would mean a table only became late the next time a human touched it.
     */
    public const STATUS_AWAITING_SETTLEMENT = 'awaiting_settlement';

    public const STATUS_OVERDUE = 'overdue';

    /** Statuses where guests are physically at the table. */
    public const OCCUPIED_STATUSES = [self::STATUS_SEATED, self::STATUS_ORDERING, self::STATUS_SERVED];

    public const STATUSES = [
        self::STATUS_FREE,
        self::STATUS_SEATED,
        self::STATUS_ORDERING,
        self::STATUS_SERVED,
        self::STATUS_CLEANING,
        self::STATUS_RESERVED,
        self::STATUS_AWAITING_SETTLEMENT,
        self::STATUS_OVERDUE,
    ];

    /**
     * The statuses a person may set by hand.
     *
     * `awaiting_settlement` and `overdue` are deliberately absent: they are readings of the
     * orders and the clock. Letting a waiter set them would let the board claim a table is
     * settled when it has an unpaid bill.
     */
    public const SETTABLE_STATUSES = [
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
