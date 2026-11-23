<?php

namespace App\Services\Cafe;

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
            throw ValidationException::withMessages(['payments' => 'At least one payment is required.']);
        }

        $normalized = [];
        $total = 0;

        foreach ($payments as $index => $payment) {
            $tender = (string) ($payment['tender'] ?? '');
            if (! in_array($tender, self::TENDERS, true)) {
                throw ValidationException::withMessages(["payments.$index.tender" => 'Unknown tender.']);
            }

            $amount = (int) ($payment['amount_minor'] ?? 0);
            if ($amount < 0) {
                throw ValidationException::withMessages(["payments.$index.amount_minor" => 'Amount cannot be negative.']);
            }

            $received = isset($payment['received_minor']) ? (int) $payment['received_minor'] : null;
            if ($received !== null && $received < $amount) {
                // Handing over less than the bill is a data-entry mistake, not a discount.
                throw ValidationException::withMessages([
                    "payments.$index.received_minor" => 'Received amount is less than the amount due.',
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

        $due = (int) $order->total_minor;

        if ($total > $due) {
            // Overpayment is a real thing (tips), but it must be expressed as a tip rather
            // than silently absorbed, or the drawer will not balance.
            throw ValidationException::withMessages([
                'payments' => 'Payments exceed the amount due; record the difference as a tip.',
            ]);
        }

        return DB::transaction(function () use ($order, $normalized, $total, $due) {
            OrderPayment::query()->where('order_id', $order->id)->delete();

            foreach ($normalized as $row) {
                OrderPayment::query()->create($row);
            }

            $cash = collect($normalized)
                ->filter(fn (array $row): bool => in_array($row['tender'], self::CASH_TENDERS, true))
                ->sum('amount_minor');

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
            ->where('order_id', $order->id)
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
            ->where('order_id', $order->id)
            ->whereIn('tender', self::CASH_TENDERS)
            ->sum('amount_minor');
    }
}
