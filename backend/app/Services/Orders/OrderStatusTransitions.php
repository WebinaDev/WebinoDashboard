<?php

namespace App\Services\Orders;

use App\Models\Order;

/**
 * Allowed next statuses for order workflow (admin stepper / validation).
 */
final class OrderStatusTransitions
{
    /**
     * @return array<string, list<string>>
     */
    public static function graph(): array
    {
        $shipBranches = ['webino-courier', 'webino-post', 'webino-tipax', 'webino-ready-to-ship', 'webino-shipping', 'shipped'];
        $cancelLike = ['cancelled', 'refunded', 'webino-returned', 'failed'];

        return [
            'pending_payment' => ['awaiting_gateway', 'on_hold', 'paid', 'payment_failed', 'cancelled', 'failed'],
            'awaiting_gateway' => ['paid', 'payment_failed', 'on_hold', 'cancelled', 'failed'],
            'on_hold' => ['paid', 'processing', 'cancelled', 'webino-need-review'],
            'paid' => ['processing', 'sent-to-warehouse', 'webino-in-stock', 'cancelled', 'refunded'],
            'payment_failed' => ['pending_payment', 'awaiting_gateway', 'cancelled', 'failed'],
            'processing' => array_merge(
                ['sent-to-warehouse', 'webino-in-stock', 'webino-packaged', 'completed', 'cancelled', 'refunded'],
                $shipBranches
            ),
            'sent-to-warehouse' => array_merge(['webino-in-stock', 'webino-packaged', 'processing'], $shipBranches, $cancelLike),
            'webino-in-stock' => array_merge(['webino-packaged', 'sent-to-warehouse', 'processing'], $shipBranches, $cancelLike),
            'webino-packaged' => array_merge($shipBranches, ['completed', 'webino-returned', 'cancelled']),
            'webino-courier' => ['webino-shipping', 'shipped', 'completed', 'webino-returned'],
            'webino-post' => ['webino-shipping', 'shipped', 'completed', 'webino-returned'],
            'webino-tipax' => ['webino-shipping', 'shipped', 'completed', 'webino-returned'],
            'webino-ready-to-ship' => array_merge($shipBranches, ['completed', 'webino-returned']),
            'webino-shipping' => ['shipped', 'completed', 'webino-returned'],
            'shipped' => ['completed', 'webino-returned', 'refunded'],
            'completed' => ['webino-returned', 'refunded'],
            'webino-returned' => ['refunded', 'processing', 'webino-in-stock'],
            'webino-need-review' => ['processing', 'on_hold', 'webino-packaged', 'cancelled'],
            'webino-deleted' => [],
            'cancelled' => [],
            'refunded' => [],
            'failed' => ['pending_payment', 'cancelled'],
        ];
    }

    public static function canTransition(string $from, string $to): bool
    {
        if ($from === $to) {
            return true;
        }

        $allowed = self::graph()[$from] ?? null;
        if ($allowed === null) {
            return in_array($to, Order::allStatuses(), true);
        }

        return in_array($to, $allowed, true);
    }

    /** @return list<string> */
    public static function nextStatuses(string $from): array
    {
        return self::graph()[$from] ?? [];
    }
}
