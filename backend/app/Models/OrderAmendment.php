<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A request to change a paid invoice, and the record of what happened to it.
 *
 * Never destructive: the order keeps its own totals until an approval applies them, and
 * `snapshot_before` preserves what the guest was originally charged.
 */
class OrderAmendment extends Model
{
    use RecordsActivity;

    protected $fillable = [
        'tenant_id',
        'order_id',
        'delta_minor',
        'reason',
        'status',
        'changes',
        'snapshot_before',
        'requested_by',
        'requested_by_name',
        'approved_by',
        'approved_by_name',
        'approved_at',
        'rejection_reason',
        'settlement_tender',
        'settled_at',
    ];

    protected function casts(): array
    {
        return [
            'delta_minor' => 'integer',
            'changes' => 'array',
            'snapshot_before' => 'array',
            'approved_at' => 'datetime',
            'settled_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** Which way the money has to move. */
    public function direction(): string
    {
        return $this->delta_minor > 0 ? 'collect' : ($this->delta_minor < 0 ? 'refund' : 'none');
    }
}
