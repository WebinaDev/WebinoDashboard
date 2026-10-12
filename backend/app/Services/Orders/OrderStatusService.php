<?php

namespace App\Services\Orders;

use App\Models\Order;
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
            $locked->fill(array_merge($extra, ['status' => $to]));
            $locked->save();
            if ($refund) {
                DB::afterCommit(fn () => app(RefundRequiredNotifier::class)->notify($locked->fresh() ?? $locked));
            }
            $order->setRawAttributes($locked->getAttributes(), true);
            $order->syncOriginal();
            $order->exists = true;

            return true;
        });
    }
}
