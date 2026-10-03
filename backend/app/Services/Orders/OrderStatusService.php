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
            $locked->fill(array_merge($extra, ['status' => $to]));
            $locked->save();
            $order->setRawAttributes($locked->getAttributes(), true);
            $order->syncOriginal();
            $order->exists = true;

            return true;
        });
    }
}
