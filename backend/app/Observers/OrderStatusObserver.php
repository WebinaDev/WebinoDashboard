<?php

namespace App\Observers;

use App\Models\Order;
use App\Services\Orders\OrderStatusNotifier;

class OrderStatusObserver
{
    /** @var array<int, string> */
    private array $previousStatus = [];

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

        $this->previousStatus[$order->getKey() ?: spl_object_id($order)] = $from;

        $meta = is_array($order->meta) ? $order->meta : [];
        $history = is_array($meta['status_history'] ?? null) ? $meta['status_history'] : [];
        $history[] = [
            'from' => $from,
            'to' => $to,
            'at' => now()->toIso8601String(),
            'by' => auth()->id(),
        ];
        $meta['status_history'] = array_slice($history, -50);
        $order->meta = $meta;
    }

    public function updated(Order $order): void
    {
        $key = $order->getKey() ?: spl_object_id($order);
        $from = $this->previousStatus[$key] ?? null;
        unset($this->previousStatus[$key]);

        if ($from === null || ! $order->wasChanged('status')) {
            return;
        }

        $this->notifier->notify($order, $from, (string) $order->status);
    }
}
