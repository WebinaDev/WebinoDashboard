<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Services\Academy\AcademyEnrollmentService;
use Illuminate\Support\Facades\DB;

final class OrderStatusService
{
    /**
     * Single writer for order status. Illegal moves (including reviving cancelled) are refused
     * and do not persist side columns.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function apply(Order $order, string $to, array $attributes = []): bool
    {
        return DB::transaction(function () use ($order, $to, $attributes) {
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->first();
            if (! $locked) {
                return false;
            }
            $from = (string) $locked->status;
            $extra = collect($attributes)->except(['status'])->all();
            if ($from !== $to && ! OrderStatusTransitions::canTransition($from, $to)) {
                return false;
            }
            $refund = false;
            if ($to === 'paid' && in_array($from, ['pending_payment', 'awaiting_gateway', 'payment_failed'], true)
                && ! app(OrderStock::class)->retakeForLatePayment($locked)) {
                // Verified money for stock that is gone: park the order for a refund instead of selling it.
                $locked->refresh();
                $meta = is_array($locked->meta) ? $locked->meta : [];
                $meta['refund_required'] = true;
                $meta['refund_reason'] = 'stock_unavailable';
                $meta['refund_flagged_at'] = now()->toIso8601String();
                $extra['meta'] = $meta;
                $to = 'on_hold';
                $refund = true;
            }
            // Stamp the moment money arrived. The paid-edit window is measured from here,
            // and `updated_at` cannot stand in for it: any later touch would reset it.
            if ($to === 'paid' && $from !== 'paid' && $locked->paid_at === null) {
                $extra['paid_at'] = now();
            }

            // Record the tender, so the sales journal can debit the account the money actually
            // landed in. Without a row, every online sale debited receivables — the money was
            // in the gateway's bank account but the ledger said it was owed to us.
            $recordTender = $to === 'paid' && $from !== 'paid';

            $locked->fill(array_merge($extra, ['status' => $to]));
            $locked->save();

            if ($recordTender && ! $refund) {
                $this->recordTender($locked->fresh() ?? $locked);
            }

            if ($refund) {
                DB::afterCommit(fn () => app(RefundRequiredNotifier::class)->notify($locked->fresh() ?? $locked));
            }
            if ($to === 'paid' && $from !== 'paid') {
                DB::afterCommit(function () use ($locked) {
                    try {
                        app(AcademyEnrollmentService::class)->enrollFromPaidOrder($locked->fresh() ?? $locked);
                    } catch (\Throwable) {
                    }
                });
            }
            $order->setRawAttributes($locked->getAttributes(), true);
            $order->syncOriginal();
            $order->exists = true;

            return true;
        });
    }

    /**
     * Write one tender row for an order that has just been paid.
     *
     * The counter till writes its own rows, so this only fills the gap the till leaves:
     * online orders, which were paid through a gateway and had no tender at all. The journal
     * then splits by tender exactly the way it already does for a split till sale.
     *
     * Never throws: a tender row is for reporting, and losing one must not block a payment
     * that has already cleared.
     */
    private function recordTender(Order $order): void
    {
        try {
            if (\App\Models\OrderPayment::query()->where('order_id', $order->id)->exists()) {
                return;
            }

            $total = (int) ($order->total_minor ?? 0);
            if ($total <= 0) {
                return;
            }

            \App\Models\OrderPayment::query()->create([
                'tenant_id' => $order->tenant_id,
                'order_id' => $order->id,
                'branch_id' => $order->branch_id ?? null,
                'tender' => $this->tenderFor($order),
                'amount_minor' => $total,
                'received_minor' => $total,
                'change_minor' => 0,
                'reference' => $order->payment_ref ?: null,
                'recorded_by' => null,
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('order.tender_record_failed', [
                'order_id' => $order->id,
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Map a gateway to a tender the journal understands.
     *
     * A wallet payment is not "online": it comes out of a balance we already hold, so it
     * settles to the same bank account but is reconciled separately.
     */
    private function tenderFor(Order $order): string
    {
        $meta = is_array($order->meta) ? $order->meta : [];

        if (! empty($meta['wallet_checkout']) || (string) ($order->payment_tender ?? '') === 'wallet') {
            return 'wallet';
        }

        $provider = (string) ($order->payment_provider ?? $meta['payment_method'] ?? '');

        return match (true) {
            // Money handed over at the door: the courier collects it, so it is cash.
            str_contains($provider, 'cod'), $provider === 'cash' => 'cash',
            // A terminal on the counter or a card-to-card transfer settles to the bank.
            str_contains($provider, 'terminal'), str_contains($provider, 'card') => 'card_to_card',
            $provider !== '' => 'online',
            default => 'online',
        };
    }
}
