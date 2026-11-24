<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\Request;
use Modules\Cafe\Services\KitchenStations;
use Modules\Cafe\Services\OperationsSettings;

class CafeKitchenController extends Controller
{
    private const STATUSES = ['new', 'preparing', 'ready', 'served', 'out_for_delivery', 'done'];

    public function __construct(
        private readonly KitchenStations $stations,
        private readonly OperationsSettings $settings,
    ) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        // Empty when this user is not pinned to a station (manager, admin): they see the whole board.
        $mine = $this->stations->stationIdsFor($request->user());
        $orders = Order::query()
            ->where('tenant_id', $tid)
            ->where('created_at', '>=', now()->subHours(18))
            // Unpaid online orders stay off the kitchen board until the gateway verifies payment.
            ->whereNotIn('status', ['pending_payment', 'awaiting_gateway', 'payment_failed', 'on_hold', 'cancelled', 'failed', 'refunded'])
            ->where(function ($q) {
                $q->whereNotNull('table_number')
                    ->orWhere('meta->source', 'guest_table');
            })
            ->with(['items.product:id,name,category_id'])
            ->latest()
            ->limit(80)
            ->get()
            ->filter(fn (Order $order): bool => $this->stations->orderTouchesStations(
                (int) $tid,
                $order,
                $mine,
            ))
            ->map(function (Order $order) use ($tid, $mine): array {
                // A cook reads only their own lines; the rest of the ticket is someone else's work.
                $this->stations->filterItemsForStations((int) $tid, $order, $mine);

                return $this->present($order);
            })
            ->values();

        return response()->json(['data' => $orders]);
    }

    /**
     * Live board feed for long-lived dashboards and the guest tracker.
     *
     * Smart clients send the newest `since` they already hold; only orders created or touched
     * after it come back, so a 5-second poll costs a few bytes instead of the whole board.
     */
    public function live(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $mine = $this->stations->stationIdsFor($request->user());
        $since = $request->query('since');
        $sinceAt = is_string($since) && $since !== '' ? \Carbon\Carbon::parse($since) : null;

        $orders = Order::query()
            ->where('tenant_id', $tid)
            ->where(function ($q) {
                $q->whereNotNull('table_number')
                    ->orWhere('meta->source', 'guest_table');
            })
            ->where(function ($q) use ($sinceAt) {
                if ($sinceAt) {
                    $q->where('updated_at', '>=', $sinceAt);
                } else {
                    $q->where('created_at', '>=', now()->subHours(18));
                }
            })
            ->with(['items.product:id,name,category_id'])
            ->latest('updated_at')
            ->limit(120)
            ->get()
            ->filter(fn (Order $order): bool => $this->stations->orderTouchesStations((int) $tid, $order, $mine))
            ->values();

        return response()->json([
            'data' => $orders->map(function (Order $order) use ($tid, $mine): array {
                $this->stations->filterItemsForStations((int) $tid, $order, $mine);

                return $this->present($order);
            })->values(),
            'meta' => [
                'server_time' => now()->toIso8601String(),
                'since' => $sinceAt?->toIso8601String(),
                // The board colours tickets from these, so the thresholds live in one place.
                'kds' => [
                    'warn_after_minutes' => $this->settings->int((int) $tid, 'kds_warn_after_minutes'),
                    'late_after_minutes' => $this->settings->int((int) $tid, 'kds_late_after_minutes'),
                ],
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function update(Request $request, Order $order): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);
        $data = $request->validate([
            'kitchen_status' => ['required', 'string', 'in:'.implode(',', self::STATUSES)],
            // Custom statuses: a free label, emoji and accent colour the board and the guest
            // tracker show. Stored on the order so two orders may carry different wording.
            'custom_status' => ['nullable', 'array'],
            'custom_status.label_fa' => ['required_with:custom_status', 'string', 'max:40'],
            'custom_status.label_en' => ['nullable', 'string', 'max:40'],
            'custom_status.emoji' => ['nullable', 'string', 'max:8'],
            'custom_status.color' => ['nullable', 'string', 'max:9', 'regex:/^#[0-9a-fA-F]{3,8}$/'],
            'custom_status.show_to_guest' => ['nullable', 'boolean'],
        ]);
        if (in_array((string) $order->status, ['pending_payment', 'awaiting_gateway', 'payment_failed', 'on_hold', 'cancelled', 'failed', 'refunded'], true)) {
            return response()->json(['message' => __('api.cafe_kitchen_order_not_payable')], 422);
        }

        \Illuminate\Support\Facades\DB::transaction(function () use ($order, $data) {
            $meta = is_array($order->meta) ? $order->meta : [];
            $meta['kitchen_status'] = $data['kitchen_status'];
            $meta['kitchen_updated_at'] = now()->toIso8601String();
            if (array_key_exists('custom_status', $data)) {
                $custom = $data['custom_status'];
                if (is_array($custom) && trim((string) ($custom['label_fa'] ?? '')) !== '') {
                    $meta['custom_status'] = [
                        'label_fa' => trim((string) $custom['label_fa']),
                        'label_en' => trim((string) ($custom['label_en'] ?? '')) ?: null,
                        'emoji' => $custom['emoji'] ?? null,
                        'color' => $custom['color'] ?? null,
                        'show_to_guest' => (bool) ($custom['show_to_guest'] ?? true),
                    ];
                } else {
                    unset($meta['custom_status']);
                }
            }
            $order->meta = $meta;
            $order->save();

            // Kitchen steps drive the order through the normal status service (stock, coupons, notifications):
            // a paid online order starts processing once the kitchen picks it up, and handing it over completes it.
            $statuses = app(\App\Services\Orders\OrderStatusService::class);
            if ($data['kitchen_status'] !== 'new' && (string) $order->status === 'paid') {
                $statuses->apply($order, 'processing');
            }
            if ($data['kitchen_status'] === 'done' && \App\Services\Orders\OrderStatusTransitions::canTransition((string) $order->status, 'completed')) {
                $statuses->apply($order, 'completed');
            }
        });

        return response()->json(['data' => $this->present($order->fresh()->load('items.product:id,name'))]);
    }

    /**
     * How long this ticket has been waiting, and whether that is too long.
     *
     * A kitchen board without a clock is a list, not a queue: the ticket at the top is the one
     * that arrived first, not the one about to be fifteen minutes late. The thresholds are the
     * tenant's (`kds_warn_after_minutes` / `kds_late_after_minutes`), measured from when the
     * order became the kitchen's problem — not from creation, or a ticket that sat unpaid for
     * ten minutes would arrive already amber.
     *
     * The clock stops when the ticket is done: a finished order must not keep ageing into red
     * behind the cook's back, or the whole board becomes red and means nothing.
     *
     * @return array<string, mixed>
     */
    private function timing(Order $order): array
    {
        $tenantId = (int) $order->tenant_id;
        $warnAfter = $this->settings->int($tenantId, 'kds_warn_after_minutes');
        $lateAfter = max($warnAfter + 1, $this->settings->int($tenantId, 'kds_late_after_minutes'));

        $meta = is_array($order->meta) ? $order->meta : [];
        $kitchenStatus = (string) ($meta['kitchen_status'] ?? 'new');

        // The clock starts when the ticket is created. For an online order that is the moment
        // it was paid (unpaid ones never reach this board), and for a ticket rung up at the
        // till it is the moment the guest ordered — both are the kitchen's problem from then.
        $startedAt = $order->created_at;

        $finishedAt = in_array($kitchenStatus, ['served', 'done', 'out_for_delivery'], true)
            ? ($order->updated_at ?? now())
            : null;

        $reference = $finishedAt ?? now();
        $minutes = $startedAt === null
            ? 0
            : (int) max(0, $startedAt->diffInMinutes($reference, false));

        $state = match (true) {
            $finishedAt !== null => 'finished',
            $minutes >= $lateAfter => 'late',
            $minutes >= $warnAfter => 'warn',
            default => 'ok',
        };

        return [
            'elapsed_minutes' => $minutes,
            'state' => $state,
            'started_at' => $startedAt?->toIso8601String(),
            'finished_at' => $finishedAt?->toIso8601String(),
            'warn_after_minutes' => $warnAfter,
            'late_after_minutes' => $lateAfter,
            'overdue_minutes' => $state === 'late' ? $minutes - $lateAfter : 0,
            // Sorting key for the board: the most overdue ticket first.
            'priority' => $state === 'late' ? $minutes - $lateAfter : ($state === 'finished' ? -1 : $minutes),
        ];
    }

    /** @return array<string, mixed> */
    private function present(Order $order): array
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        // Per-line prep, so the board can tick one dish without moving the whole ticket.
        // A mixed ticket (two coffees out, one pastry still baking) is otherwise unreadable.
        $prep = app(\Modules\Cafe\Services\KitchenPrep::class)->forOrder($order);
        $prepByItem = collect($prep['items'])->keyBy('order_item_id');

        return [
            'id' => $order->id,
            'number' => $order->number ?? $order->id,
            'status' => $order->status,
            'kitchen_status' => $meta['kitchen_status'] ?? 'new',
            'custom_status' => $meta['custom_status'] ?? null,
            'kitchen_updated_at' => $meta['kitchen_updated_at'] ?? null,
            'paid' => in_array((string) $order->status, ['paid', 'processing', 'completed'], true),
            'fulfillment' => $meta['fulfillment'] ?? 'dine_in',
            'table_number' => $order->table_number,
            'branch_slug' => $order->branch_slug,
            'customer_phone' => $order->customer_phone,
            'customer_note' => $order->customer_note,
            'customer_name' => $order->customer_name,
            'shipping_address' => $order->shipping_address,
            'delivery' => $meta['delivery'] ?? null,
            'pickup_at' => $meta['pickup_at'] ?? $meta['delivery_at'] ?? null,
            'payment_method' => $meta['payment_method'] ?? null,
            'total_minor' => $order->total_minor,
            'currency' => $order->currency,
            'created_at' => $order->created_at,
            'items' => $order->items->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->product_name ?: $item->product?->name,
                'quantity' => $item->quantity,
                'unit_price_minor' => $item->unit_price_minor,
                'selections' => is_array($item->meta) ? ($item->meta['selections'] ?? []) : [],
                // `new` when nobody has touched the line yet; derived over every station
                // working it, so a dish split across two stations reads ready only when both
                // are done.
                'prep_status' => $prepByItem->get($item->id)['status'] ?? 'new',
            ])->values(),
            // Derived over all lines: what the ticket as a whole is doing, independent of
            // `kitchen_status`, which a cook may not have moved yet.
            'prep_state' => $prep['state'],
            'timing' => $this->timing($order),
        ];
    }
}
