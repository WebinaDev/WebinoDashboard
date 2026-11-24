<?php

namespace Modules\Cafe\Services;

use App\Models\Order;
use App\Models\OrderAmendment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Editing an invoice that has already been paid.
 *
 * This is the one operation in the system that can rewrite money after the guest has left,
 * so it is built so that nothing is ever destructive:
 *
 *  - the order's own totals are NOT touched when the request is made; an amendment is a
 *    request describing what should change and how much money has to move;
 *  - a request inside the window still needs approval when the shop asks for it, and the
 *    requester can never approve their own edit;
 *  - approving applies the change, and the settlement records which way the money went
 *    (collected or returned) so the drawer and the accountant both see it;
 *  - every amendment keeps `changes` and `snapshot_before`, so the original receipt remains
 *    explainable years later.
 */
final class OrderAmendments
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_SETTLED = 'settled';

    /** Statuses whose money has already moved. */
    public const PAID_STATUSES = ['paid', 'processing', 'prepared', 'ready', 'served', 'completed', 'shipped'];

    public function __construct(private readonly OperationsSettings $settings) {}

    /**
     * Ask for an edit.
     *
     * @param  array{reason: string, changes: array<string, mixed>, delta_minor?: int|null}  $data
     */
    public function request(Order $order, array $data, User $actor): OrderAmendment
    {
        if (! in_array((string) $order->status, self::PAID_STATUSES, true)) {
            throw ValidationException::withMessages([
                'order' => 'Only a paid order needs an amendment; an open order can be edited directly.',
            ]);
        }

        $minutes = $this->settings->paidEditWindowMinutes((int) $order->tenant_id);

        if ($minutes <= 0) {
            throw ValidationException::withMessages([
                'order' => 'Editing a paid invoice is disabled for this shop.',
            ]);
        }

        // The window is measured from payment, not from creation: an order rung up at 9am
        // and paid at noon has its half hour from noon.
        $paidAt = $order->paid_at ?? $order->updated_at ?? $order->created_at;
        $age = $paidAt ? (int) $paidAt->diffInMinutes(now()) : 0;

        if ($age > $minutes) {
            throw ValidationException::withMessages([
                'order' => "The edit window for this invoice closed {$minutes} minutes after payment.",
            ]);
        }

        $changes = is_array($data['changes'] ?? null) ? $data['changes'] : [];

        if ($changes === []) {
            throw ValidationException::withMessages(['changes' => 'Nothing to change.']);
        }

        $delta = array_key_exists('delta_minor', $data) && $data['delta_minor'] !== null
            ? (int) $data['delta_minor']
            : $this->deriveDelta($order, $changes);

        return OrderAmendment::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'delta_minor' => $delta,
            'reason' => (string) $data['reason'],
            'status' => self::STATUS_PENDING,
            'changes' => $changes,
            'snapshot_before' => [
                'status' => $order->status,
                'subtotal_minor' => (int) $order->subtotal_minor,
                'discount_minor' => (int) $order->discount_minor,
                'total_minor' => (int) $order->total_minor,
                'amount_paid_minor' => $order->amount_paid_minor === null ? null : (int) $order->amount_paid_minor,
            ],
            'requested_by' => $actor->id,
            'requested_by_name' => $actor->name,
        ]);
    }

    /**
     * Approve and apply. The approver is recorded, and cannot be the requester.
     */
    public function approve(OrderAmendment $amendment, User $approver): OrderAmendment
    {
        if ($amendment->status !== self::STATUS_PENDING) {
            throw ValidationException::withMessages(['amendment' => 'This amendment is no longer pending.']);
        }

        if ((int) $amendment->requested_by === (int) $approver->id) {
            // Four eyes: the point of the approval is that someone else looked at it.
            throw ValidationException::withMessages([
                'amendment' => 'The person who requested an edit cannot approve it.',
            ]);
        }

        return DB::transaction(function () use ($amendment, $approver): OrderAmendment {
            $order = Order::query()->whereKey($amendment->order_id)->lockForUpdate()->firstOrFail();

            $applied = $this->applyChanges($order, (array) $amendment->changes);

            $amendment->forceFill([
                'status' => self::STATUS_APPROVED,
                'approved_by' => $approver->id,
                'approved_by_name' => $approver->name,
                'approved_at' => now(),
                'snapshot_before' => array_merge((array) $amendment->snapshot_before, [
                    'applied_total_minor' => $applied,
                ]),
            ])->save();

            return $amendment->fresh();
        });
    }

    public function reject(OrderAmendment $amendment, User $actor, string $reason): OrderAmendment
    {
        if ($amendment->status !== self::STATUS_PENDING) {
            throw ValidationException::withMessages(['amendment' => 'This amendment is no longer pending.']);
        }

        $amendment->forceFill([
            'status' => self::STATUS_REJECTED,
            'approved_by' => $actor->id,
            'approved_by_name' => $actor->name,
            'approved_at' => now(),
            'rejection_reason' => $reason,
        ])->save();

        return $amendment->fresh();
    }

    /** Record that the difference was actually collected or returned. */
    public function settle(OrderAmendment $amendment, string $tender, User $actor): OrderAmendment
    {
        if ($amendment->status !== self::STATUS_APPROVED) {
            throw ValidationException::withMessages(['amendment' => 'Only an approved amendment can be settled.']);
        }

        if (! in_array($tender, OrderPayments::TENDERS, true)) {
            throw ValidationException::withMessages(['tender' => 'Unknown tender.']);
        }

        $amendment->forceFill([
            'status' => self::STATUS_SETTLED,
            'settlement_tender' => $tender,
            'settled_at' => now(),
        ])->save();

        return $amendment->fresh();
    }

    /** @return array<int, array<string, mixed>> */
    public function history(Order $order): array
    {
        return OrderAmendment::query()
            ->where('order_id', $order->id)
            ->orderByDesc('id')
            ->get()
            ->map(fn (OrderAmendment $row): array => [
                'id' => $row->id,
                'reason' => $row->reason,
                'status' => $row->status,
                'delta_minor' => (int) $row->delta_minor,
                'direction' => $row->delta_minor > 0 ? 'collect' : ($row->delta_minor < 0 ? 'refund' : 'none'),
                'changes' => $row->changes,
                'snapshot_before' => $row->snapshot_before,
                'requested_by' => $row->requested_by_name,
                'approved_by' => $row->approved_by_name,
                'approved_at' => $row->approved_at?->toIso8601String(),
                'rejection_reason' => $row->rejection_reason,
                'settlement_tender' => $row->settlement_tender,
                'settled_at' => $row->settled_at?->toIso8601String(),
                'created_at' => $row->created_at?->toIso8601String(),
            ])
            ->all();
    }

    /**
     * Apply the field changes to the order and return the new total.
     *
     * Only a whitelist is honoured — an amendment must not be able to rewrite `tenant_id`,
     * `status`, or anything else that would break the order's invariants.
     *
     * @param  array<string, mixed>  $changes
     */
    private function applyChanges(Order $order, array $changes): int
    {
        $allowed = ['subtotal_minor', 'discount_minor', 'shipping_minor', 'total_minor', 'customer_note'];
        $fill = [];

        foreach ($changes as $field => $value) {
            if (! in_array($field, $allowed, true)) {
                continue;
            }

            if ($field === 'customer_note') {
                $fill[$field] = is_string($value) ? $value : null;
                continue;
            }

            $fill[$field] = max(0, (int) $value);
        }

        if ($fill === []) {
            throw ValidationException::withMessages(['changes' => 'None of the requested fields can be amended.']);
        }

        // Recompute the total when its components moved, so a "fix the discount" edit cannot
        // leave the order internally inconsistent.
        if (! array_key_exists('total_minor', $fill) && array_intersect(array_keys($fill), ['subtotal_minor', 'discount_minor', 'shipping_minor']) !== []) {
            $subtotal = (int) ($fill['subtotal_minor'] ?? $order->subtotal_minor);
            $discount = (int) ($fill['discount_minor'] ?? $order->discount_minor);
            $shipping = (int) ($fill['shipping_minor'] ?? $order->shipping_minor);
            $fill['total_minor'] = max(0, $subtotal - $discount + $shipping);
        }

        $order->forceFill($fill)->saveQuietly();

        return (int) $order->total_minor;
    }

    /**
     * Infer the money delta when the caller did not supply one.
     *
     * @param  array<string, mixed>  $changes
     */
    private function deriveDelta(Order $order, array $changes): int
    {
        if (array_key_exists('total_minor', $changes)) {
            return (int) $changes['total_minor'] - (int) $order->total_minor;
        }

        $subtotal = (int) ($changes['subtotal_minor'] ?? $order->subtotal_minor);
        $discount = (int) ($changes['discount_minor'] ?? $order->discount_minor);
        $shipping = (int) ($changes['shipping_minor'] ?? $order->shipping_minor);

        return max(0, $subtotal - $discount + $shipping) - (int) $order->total_minor;
    }
}
