<?php

namespace App\Observers;

use App\Models\Order;
use App\Services\Orders\OrderLifecycle;
use App\Services\Orders\OrderStatusNotifier;
use App\Support\AuditActor;

class OrderStatusObserver
{
    /**
     * Static: Laravel resolves a fresh observer instance per model event.
     *
     * @var array<int, string>
     */
    private static array $previousStatus = [];

    public function __construct(protected OrderStatusNotifier $notifier) {}

    public function updating(Order $order): void
    {
        if (! $order->isDirty('status')) {
            return;
        }

        $from = (string) $order->getOriginal('status');
        $to = (string) $order->status;
        if ($from === '' || $from === $to) {
            return;
        }

        self::$previousStatus[$order->getKey() ?: spl_object_id($order)] = $from;

        $meta = is_array($order->meta) ? $order->meta : [];
        $history = is_array($meta['status_history'] ?? null) ? $meta['status_history'] : [];
        $history[] = array_merge([
            'from' => $from,
            'to' => $to,
            'at' => now()->toIso8601String(),
        ], AuditActor::stamp());
        $meta['status_history'] = array_slice($history, -50);
        $order->meta = $meta;
    }

    public function updated(Order $order): void
    {
        $key = $order->getKey() ?: spl_object_id($order);
        $from = self::$previousStatus[$key] ?? null;
        unset(self::$previousStatus[$key]);

        if ($from === null || ! $order->wasChanged('status')) {
            return;
        }

        app(OrderLifecycle::class)->sync($order->fresh() ?? $order, $from);
        $this->notifier->notify($order->fresh() ?? $order, $from, (string) $order->status);
    }
}
