<?php

namespace Modules\Cafe\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A cash movement inside a shift that is not a sale: paying a supplier from the drawer,
 * banking a cash drop, opening the drawer without a sale, or a plain note for the auditor.
 *
 * Only cash_in / cash_out / drop move the expected-cash figure. `no_sale` and `note` are
 * recorded for the audit trail but deliberately leave the drawer arithmetic untouched.
 *
 * Audited for the same reason: a drawer movement is somebody handling money, and the trail is
 * the only place that says who.
 */
class CafeShiftMovement extends Model
{
    use \App\Support\Audit\RecordsActivity;

    public const TYPE_CASH_IN = 'cash_in';

    public const TYPE_CASH_OUT = 'cash_out';

    public const TYPE_DROP = 'drop';

    public const TYPE_NO_SALE = 'no_sale';

    public const TYPE_NOTE = 'note';

    public const TYPES = [
        self::TYPE_CASH_IN,
        self::TYPE_CASH_OUT,
        self::TYPE_DROP,
        self::TYPE_NO_SALE,
        self::TYPE_NOTE,
    ];

    /** Types that change how much cash should be in the drawer. */
    public const CASH_AFFECTING = [
        self::TYPE_CASH_IN,
        self::TYPE_CASH_OUT,
        self::TYPE_DROP,
    ];

    protected $fillable = [
        'tenant_id',
        'shift_id',
        'user_id',
        'type',
        'amount_minor',
        'reason',
    ];

    protected function casts(): array
    {
        return [
            'amount_minor' => 'integer',
        ];
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(CafeShift::class, 'shift_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Signed effect on the drawer.
     *
     * A drop is money taken out of the till and put in the safe — it lowers the cash on hand
     * without being an expense, so it is subtracted just like a cash_out.
     */
    public function signedAmount(): int
    {
        return match ((string) $this->type) {
            self::TYPE_CASH_IN => (int) $this->amount_minor,
            self::TYPE_CASH_OUT, self::TYPE_DROP => -abs((int) $this->amount_minor),
            default => 0,
        };
    }
}
