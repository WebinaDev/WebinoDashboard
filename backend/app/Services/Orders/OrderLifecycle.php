<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Services\Coupons\CouponService;

/**
 * Stock, coupon consumption, and wallet debit follow the same status edge.
 */
final class OrderLifecycle
{
    public function __construct(
        private readonly OrderStock $stock,
        private readonly CouponService $coupons,
        private readonly WalletCheckout $wallet,
    ) {}

    public function sync(Order $order, ?string $from): void
    {
        $to = (string) $order->status;
        $this->stock->sync($order, $from, $to);
        $order->refresh();
        $this->coupons->syncOrder($order, $from, $to);
        $order->refresh();
        $this->wallet->sync($order, $from, $to);
    }
}
