<?php

namespace Modules\Cafe\Entities;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One business day, closed by a manager.
 *
 * A shift closes a till; a day closes the shop. They are not the same document: a busy
 * Saturday has three cashiers, two shifts each on different tills, and the manager signs off
 * the totals of the whole day — the takings, the drawer variances, and what is carried to the
 * accountant. Closing per shift left nobody accountable for the day as a whole, and the
 * accountant had to add up shifts by hand to know what to post.
 */
class CafeDayClose extends Model
{
    use RecordsActivity;

    /** `totals` is a computed snapshot; the money columns are audited. */
    protected array $activityHidden = ['totals'];

    public const STATUS_OPEN = 'open';

    public const STATUS_CLOSED = 'closed';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'business_date',
        'status',
        'shifts',
        'gross_sales_minor',
        'cash_sales_minor',
        'non_cash_sales_minor',
        'discounts_minor',
        'tax_minor',
        'expected_cash_minor',
        'counted_cash_minor',
        'variance_minor',
        'totals',
        'note',
        'closed_by',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'shifts' => 'integer',
            'gross_sales_minor' => 'integer',
            'cash_sales_minor' => 'integer',
            'non_cash_sales_minor' => 'integer',
            'discounts_minor' => 'integer',
            'tax_minor' => 'integer',
            'expected_cash_minor' => 'integer',
            'counted_cash_minor' => 'integer',
            'variance_minor' => 'integer',
            'totals' => 'array',
            'closed_at' => 'datetime',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'closed_by');
    }
}
