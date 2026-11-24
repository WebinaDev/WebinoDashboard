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

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'user_id',
        'status',
        'opening_float_minor',
        'counted_cash_minor',
        'expected_cash_minor',
        'variance_minor',
        'totals',
        'note',
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
}
