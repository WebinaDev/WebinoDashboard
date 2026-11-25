<?php

namespace App\Services\Webhooks;

use App\Models\Order;
use Illuminate\Support\Facades\DB;

/**
 * Turns a lifecycle change into the hook events the shop subscribed to.
 *
 * Lives outside the Cafe module because orders arrive from the storefront too, and a webhook
 * that only fires for counter sales is worse than none: the integration it feeds silently
 * shows half the trade.
 *
 * Nothing is sent here. Deliveries are queued rows; a worker posts them. That keeps a slow or
 * dead endpoint from ever being in the path of a sale, which is the only property of this
 * service that matters operationally.
 */
final class WebhookDispatcher
{
    /** Order status → the event name an integration would recognise. */
    private const STATUS_EVENTS = [
        'paid' => 'order.settled',
        'completed' => 'order.settled',
        'cancelled' => 'order.cancelled',
        'refunded' => 'order.cancelled',
        'on_hold' => 'order.cancelled',
    ];

    public function orderEvent(int $tenantId, Order $order, string $from, string $to, bool $refund = false): void
    {
        if (! $this->tableExists()) {
            return;
        }

        // A settled or cancelled order is the event every integration cares about; any other
        // transition (into the kitchen, into delivery) is still news a display screen wants,
        // and is reported as `order.created` because that is when the shop first sees it.
        $event = self::STATUS_EVENTS[$to] ?? 'order.created';

        $this->queue($tenantId, $event, [
            'order_id' => (int) $order->id,
            'number' => $order->number,
            'status' => $to,
            'previous_status' => $from,
            'total_minor' => (int) ($order->total_minor ?? 0),
            'currency' => $order->currency,
            'branch_id' => $order->branch_id === null ? null : (int) $order->branch_id,
            'table_number' => $order->table_number,
            // Only present when stock could not be retaken for verified money.
            'refund_required' => $refund ?: null,
            'at' => now()->toIso8601String(),
        ]);
    }

    /** @param  array<string, mixed>  $payload */
    public function queue(int $tenantId, string $event, array $payload): void
    {
        if (! $this->tableExists()) {
            return;
        }

        $hooks = DB::table('cafe_webhooks')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get();

        foreach ($hooks as $hook) {
            $events = json_decode((string) ($hook->events ?? 'null'), true);
            if (is_array($events) && $events !== [] && ! in_array($event, $events, true)) {
                continue;
            }

            DB::table('cafe_webhook_deliveries')->insert([
                'tenant_id' => $tenantId,
                'webhook_id' => $hook->id,
                'event' => $event,
                'status' => 'queued',
                'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function tableExists(): bool
    {
        static $exists = null;

        return $exists ??= \Illuminate\Support\Facades\Schema::hasTable('cafe_webhooks');
    }
}
