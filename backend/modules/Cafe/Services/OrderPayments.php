<?php

namespace Modules\Cafe\Services;

use App\Models\Order;
use App\Models\OrderPayment;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Records how a sale was actually paid for, across several tenders.
 *
 * A guest pays 300k in cash and the rest on a card. `orders.payment_tender` is a single
 * string, so it cannot describe that — and the drawer reconciliation in CafeShiftService
 * has to separate cash from card to count the drawer. This service owns both the rows and
 * the rollup back onto the order.
 */
final class OrderPayments
{
    /** Tendered types that land in the drawer as cash. Kept in step with CafeShiftService. */
    public const CASH_TENDERS = ['cash', 'cod'];

    public const TENDERS = ['cash', 'card_to_card', 'pos_terminal', 'online', 'wallet', 'other'];

    /**
     * Replace an order's payments with the given split and re-derive the order totals.
     *
     * Replacing rather than appending is deliberate: the settle dialog can be reopened and
     * corrected, and two partial sets would double-count the drawer.
     *
     * @param  array<int, array{tender: string, amount_minor: int, received_minor?: int|null, reference?: string|null}>  $payments
     */
    public function replace(Order $order, array $payments, ?int $actorId = null): Order
    {
        if ($payments === []) {
            throw ValidationException::withMessages(['payments' => __('api.cafe_payment_required')]);
        }

        $normalized = [];
        $total = 0;

        foreach ($payments as $index => $payment) {
            $tender = (string) ($payment['tender'] ?? '');
            if (! in_array($tender, self::TENDERS, true)) {
                throw ValidationException::withMessages(["payments.$index.tender" => __('api.cafe_payment_unknown_tender')]);
            }

            $amount = (int) ($payment['amount_minor'] ?? 0);
            if ($amount < 0) {
                throw ValidationException::withMessages(["payments.$index.amount_minor" => __('api.cafe_payment_negative_amount')]);
            }

            $received = isset($payment['received_minor']) ? (int) $payment['received_minor'] : null;
            if ($received !== null && $received < $amount) {
                // Handing over less than the bill is a data-entry mistake, not a discount.
                throw ValidationException::withMessages([
                    "payments.$index.received_minor" => __('api.cafe_payment_received_too_low'),
                ]);
            }

            $normalized[] = [
                'tenant_id' => $order->tenant_id,
                'order_id' => $order->id,
                'branch_id' => $order->branch_id,
                'tender' => $tender,
                'amount_minor' => $amount,
                'received_minor' => $received,
                'change_minor' => $received === null ? null : $received - $amount,
                'reference' => isset($payment['reference']) ? (string) $payment['reference'] : null,
                'recorded_by' => $actorId,
            ];

            $total += $amount;
        }

        return DB::transaction(function () use ($order, $normalized, $total, $actorId) {
            $order = Order::query()
                ->where('tenant_id', $order->tenant_id)
                ->lockForUpdate()
                ->findOrFail($order->id);

            if ($total > (int) $order->total_minor) {
                throw ValidationException::withMessages([
                    'payments' => __('api.cafe_payment_exceeds_due'),
                ]);
            }

            OrderPayment::query()
                ->where('tenant_id', $order->tenant_id)
                ->where('order_id', $order->id)
                ->whereNull('superseded_at')
                ->update(['superseded_at' => now(), 'superseded_by' => $actorId]);

            foreach ($normalized as $row) {
                $row['branch_id'] = $order->branch_id;
                OrderPayment::query()->create($row);
            }

            // The first tender stays on the order for every existing report that reads it.
            $primary = $normalized[0]['tender'];

            $order->forceFill([
                'amount_paid_minor' => $total,
                'payment_tender' => $primary,
            ])->saveQuietly();

            return $order->fresh();
        });
    }

    /** @return array<int, array<string, mixed>> */
    public function forOrder(Order $order): array
    {
        return OrderPayment::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('order_id', $order->id)
            ->whereNull('superseded_at')
            ->orderBy('id')
            ->get()
            ->map(fn (OrderPayment $row): array => [
                'id' => $row->id,
                'tender' => $row->tender,
                'amount_minor' => (int) $row->amount_minor,
                'received_minor' => $row->received_minor === null ? null : (int) $row->received_minor,
                'change_minor' => $row->change_minor === null ? null : (int) $row->change_minor,
                'reference' => $row->reference,
                'created_at' => $row->created_at?->toIso8601String(),
            ])
            ->all();
    }

    /** Cash portion of a sale — what the drawer must contain for this order. */
    public function cashPortion(Order $order): int
    {
        return (int) OrderPayment::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('order_id', $order->id)
            ->whereNull('superseded_at')
            ->whereIn('tender', self::CASH_TENDERS)
            ->sum('amount_minor');
    }
}
