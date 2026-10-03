<?php

namespace App\Services\Orders;

use App\Models\Order;

final class OrderStatusService
{
    /**
     * Single writer for order status. Illegal moves (including reviving cancelled) are refused.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function apply(Order $order, string $to, array $attributes = []): bool
    {
        $from = (string) $order->status;
        $extra = collect($attributes)->except(['status'])->all();
        if ($from !== $to && ! OrderStatusTransitions::canTransition($from, $to)) {
            if ($extra !== []) {
                $order->fill($extra);
                $order->save();
            }

            return false;
        }
        $order->fill(array_merge($extra, ['status' => $to]));
        $order->save();

        return true;
    }
}
