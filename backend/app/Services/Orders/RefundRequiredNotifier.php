<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Services\Notifications\NotificationDispatcher;
use Illuminate\Support\Facades\Log;

/**
 * Staff (every configured channel) and the customer hear about a verified payment that has to be
 * refunded because the stock ran out after the hold expired. No gateway here exposes a refund call,
 * so staff refund by hand and move the order to "refunded".
 */
final class RefundRequiredNotifier
{
    public function __construct(private readonly NotificationDispatcher $dispatcher) {}

    public function notify(Order $order): void
    {
        Log::warning('order_refund_required', ['tenant_id' => $order->tenant_id, 'order_id' => $order->id, 'amount' => $order->amount_paid_minor]);
        try {
            $this->dispatcher->dispatch('order_refund_required', (int) $order->tenant_id, [
                'vars' => [
                    'order_number' => (string) ($order->number ?? $order->id),
                    'customer_name' => (string) ($order->customer_name ?? ''),
                    'customer_phone' => (string) ($order->customer_phone ?? ''),
                    'amount' => number_format((int) ($order->amount_paid_minor ?: $order->total_minor)),
                ],
                'type' => 'order_refund_required',
                'customer_user_id' => $order->user_id ? (int) $order->user_id : null,
                'customer_email' => (string) ($order->customer_email ?? ''),
                'customer_phone' => (string) ($order->customer_phone ?? ''),
                'customer_link' => '/dashboard/account/orders/'.$order->id,
                'admin_link' => '/dashboard/orders/'.$order->id,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
