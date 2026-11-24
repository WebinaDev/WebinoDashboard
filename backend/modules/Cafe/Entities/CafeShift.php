<?php

namespace Modules\Cafe\Entities;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One cashier's shift at one till.
 *
 * Money questions are answered from `totals` (frozen at close) rather than recomputed, so a
 * late order correction cannot silently rewrite a shift that has already been reconciled
 * with the safe.
 */
class CafeShift extends Model
{
    use RecordsActivity;

    /** `totals` is a frozen snapshot; the shift's own money columns are audited. */
    protected array $activityHidden = ['totals'];

    public const STATUS_OPEN = 'open';

    public const STATUS_CLOSED = 'closed';

    /** The cashier has submitted a count; it is waiting for a manager to approve it. */
    public const STATUS_PENDING_APPROVAL = 'pending_approval';

    /** Count states. A shift is `counted` only once the count has been accepted. */
    public const COUNT_COUNTED = 'counted';

    public const COUNT_PENDING = 'pending_approval';

    public const COUNT_APPROVED = 'approved';

    public const COUNT_REJECTED = 'rejected';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'user_id',
        'status',
        'opening_float_minor',
        'counted_cash_minor',
        'count_status',
        'counted_by',
        'counted_at',
        'approved_by',
        'approved_at',
        'approval_note',
        'expected_cash_minor',
        'variance_minor',
        'totals',
        'note',
        'journal_entry_id',
        'day_close_id',
        'opened_at',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'opening_float_minor' => 'integer',
            'counted_cash_minor' => 'integer',
            'expected_cash_minor' => 'integer',
            'variance_minor' => 'integer',
            'totals' => 'array',
            'counted_at' => 'datetime',
            'approved_at' => 'datetime',
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(CafeShiftMovement::class, 'shift_id');
    }

    public function isOpen(): bool
    {
        return (string) $this->status === self::STATUS_OPEN;
    }

    /**
     * A count that has not been accepted yet.
     *
     * While this is true the drawer's expected figure must not leave the server for the
     * cashier: a blind count is the whole point of the separation, and the UI shows what the
     * API gives it. Auditors still see it — checking a cashier is exactly their job.
     */
    public function isAwaitingApproval(): bool
    {
        return (string) $this->status === self::STATUS_PENDING_APPROVAL
            || (string) $this->count_status === self::COUNT_PENDING;
    }

    /** Whoever counted the drawer, when that is not the cashier who opened it. */
    public function countedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counted_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function dayClose(): BelongsTo
    {
        return $this->belongsTo(CafeDayClose::class, 'day_close_id');
    }
}
