<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Models\UserNotification;
use App\Services\Auth\OtpDeliveryService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Notify customer on order status changes (in-app, email, SMS).
 */
class OrderStatusNotifier
{
    public function __construct(
        protected ?OtpDeliveryService $otpDelivery = null,
    ) {}

    public function notify(Order $order, string $fromStatus, string $toStatus, array $extra = []): void
    {
        if ($fromStatus === $toStatus && empty($extra['force'])) {
            return;
        }

        $label = OrderShippingStatuses::label($toStatus, app()->getLocale() === 'en' ? 'en' : 'fa');
        $tracking = $order->trackingCode() ?? '';
        $vars = array_merge([
            'order_number' => (string) ($order->number ?? $order->id),
            'status_label' => $label,
            'tracking_code' => $tracking,
            'return_reason' => (string) ($extra['return_reason'] ?? ''),
            'return_amount' => (string) ($extra['return_amount'] ?? ''),
        ], $extra);

        $title = __('orders.notify_title', ['number' => $vars['order_number']], app()->getLocale());
        $body = __('orders.notify_body', [
            'number' => $vars['order_number'],
            'status' => $vars['status_label'],
            'tracking' => $vars['tracking_code'],
        ], app()->getLocale());

        // Fallback if lang keys missing
        if ($title === 'orders.notify_title') {
            $title = 'Order #'.$vars['order_number'];
        }
        if ($body === 'orders.notify_body') {
            $body = 'Status: '.$vars['status_label'].($tracking !== '' ? ' — tracking '.$tracking : '');
        }

        $smsOnly = ! empty($extra['sms_only']);
        $emailOnly = ! empty($extra['email_only']);

        if ($order->user_id && ! $smsOnly && ! $emailOnly) {
            UserNotification::query()->create([
                'tenant_id' => $order->tenant_id,
                'user_id' => $order->user_id,
                'type' => 'order_status',
                'title' => $title,
                'body' => $body,
                'link' => '/dashboard/account/orders/'.$order->id,
                'created_at' => now(),
            ]);
        }

        if (! $smsOnly && filled($order->customer_email)) {
            try {
                Mail::raw($body, function ($message) use ($order, $title) {
                    $message->to((string) $order->customer_email)->subject($title);
                });
            } catch (\Throwable $e) {
                Log::warning('order_status_email_failed', ['order' => $order->id, 'error' => $e->getMessage()]);
            }
        }

        $event = OrderShippingStatuses::smsEventFor($toStatus);
        if (! $emailOnly && $event && filled($order->customer_phone)) {
            try {
                $smsBody = strtr(
                    'Order {order_number}: {status_label}'.($tracking !== '' ? ' Tracking: {tracking_code}' : ''),
                    [
                        '{order_number}' => $vars['order_number'],
                        '{status_label}' => $vars['status_label'],
                        '{tracking_code}' => $vars['tracking_code'],
                    ]
                );
                // Prefer existing SMS client if OtpDelivery can send plain SMS — best-effort.
                if ($this->otpDelivery) {
                    // Delivery service is OTP-oriented; log event for Phase 7 templates.
                    Log::info('order_status_sms_event', [
                        'tenant_id' => $order->tenant_id,
                        'order_id' => $order->id,
                        'event' => $event,
                        'phone' => $order->customer_phone,
                        'body' => $smsBody,
                    ]);
                }
            } catch (\Throwable $e) {
                Log::warning('order_status_sms_failed', ['order' => $order->id, 'error' => $e->getMessage()]);
            }
        }
    }

    public function appendHistory(Order $order, string $from, string $to, ?int $byUserId = null): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $history = is_array($meta['status_history'] ?? null) ? $meta['status_history'] : [];
        $history[] = [
            'from' => $from,
            'to' => $to,
            'at' => now()->toIso8601String(),
            'by' => $byUserId,
        ];
        $meta['status_history'] = array_slice($history, -50);
        $order->meta = $meta;
        $order->save();
    }
}
