<?php

namespace Modules\Cafe\Services;

use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Support\Facades\DB;

/**
 * Per-line prep state, so a cook can tick one dish without moving the whole ticket.
 *
 * The ticket's overall `kitchen_status` stays where it is; the board derives "all lines
 * ready" from here. That is what makes a mixed ticket (two coffees out, one pastry still
 * baking) readable instead of a lie.
 */
final class KitchenPrep
{
    /**
     * Set one line's state.
     *
     * `stationId` may be null for a cook with no station — they are working the whole
     * board, so their tick applies to the line itself.
     */
    public function mark(Order $order, OrderItem $item, string $status, ?int $stationId, ?int $userId): void
    {
        abort_if((int) $item->order_id !== (int) $order->id, 422);

        DB::table('cafe_order_item_prep')->updateOrInsert(
            ['order_item_id' => $item->id, 'station_id' => $stationId],
            [
                'tenant_id' => $order->tenant_id,
                'order_id' => $order->id,
                'status' => $status,
                'marked_by' => $userId,
                'marked_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }

    /**
     * Prep state for every line of an order, plus the derived ticket state.
     *
     * @return array{items: array<int, array<string, mixed>>, state: string}
     */
    public function forOrder(Order $order): array
    {
        $order->loadMissing('items');

        $rows = DB::table('cafe_order_item_prep')
            ->where('order_id', $order->id)
            ->get()
            ->groupBy('order_item_id');

        $items = [];
        $allReady = true;
        $anyStarted = false;

        foreach ($order->items as $item) {
            $lineRows = $rows->get($item->id, collect());
            $statuses = $lineRows->pluck('status')->unique()->values()->all();
            $status = $this->collapse($statuses);

            if ($status !== 'ready' && $status !== 'served') {
                $allReady = false;
            }
            if ($status !== 'new') {
                $anyStarted = true;
            }

            $items[] = [
                'order_item_id' => $item->id,
                'product_name' => $item->product_name ?? $item->product?->name,
                'quantity' => (int) $item->quantity,
                'status' => $status,
                'stations' => $lineRows->pluck('station_id')->filter()->unique()->values()->all(),
                'marked_at' => $lineRows->first()?->marked_at,
            ];
        }

        return [
            'items' => $items,
            'state' => $allReady && $items !== [] ? 'ready' : ($anyStarted ? 'preparing' : 'new'),
        ];
    }

    /**
     * One line may be worked by several stations (a dish plus its side). The line is only
     * "ready" when every station working it says so.
     *
     * @param  array<int, string>  $statuses
     */
    private function collapse(array $statuses): string
    {
        if ($statuses === []) {
            return 'new';
        }

        if (count(array_filter($statuses, fn (string $s): bool => $s === 'served')) === count($statuses)) {
            return 'served';
        }

        if (count(array_filter($statuses, fn (string $s): bool => $s === 'ready' || $s === 'served')) === count($statuses)) {
            return 'ready';
        }

        if (array_intersect($statuses, ['preparing', 'ready', 'served']) !== []) {
            return 'preparing';
        }

        return 'new';
    }
}
