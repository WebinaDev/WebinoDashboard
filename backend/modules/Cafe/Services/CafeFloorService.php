<?php

namespace Modules\Cafe\Services;

use App\Models\Order;
use Illuminate\Support\Collection;
use Modules\Cafe\Entities\CafeTable;

/**
 * Live floor state.
 *
 * A table's status is driven by what is actually happening on it, not only by what someone
 * last tapped. The stored `status` column is the human override (seated / cleaning / reserved);
 * this service reconciles it against the open orders so the waiter board never shows a dirty
 * table as free, or an empty table as busy after the guests paid.
 */
class CafeFloorService
{
    /** Orders that still mean "these guests are here". */
    public const OPEN_ORDER_STATUSES = [
        'pending',
        'paid',
        'processing',
        'preparing',
        'ready',
        'shipped',
        'out_for_delivery',
        'served',
        'completed',
    ];

    /**
     * How long a table may sit with nothing left to serve before it counts as late.
     *
     * A café table that finished eating twenty minutes ago is normal; one that finished an hour
     * and a half ago is a table nobody is watching. The threshold is a constant rather than a
     * column because it is a judgement about cafés, not a setting each shop should have to tune
     * before the board means anything.
     */
    public const OVERDUE_AFTER_MINUTES = 90;

    /** Orders that must be ignored entirely. */
    public const DEAD_ORDER_STATUSES = [
        'pending_payment',
        'awaiting_gateway',
        'payment_failed',
        'on_hold',
        'cancelled',
        'failed',
        'refunded',
    ];

    /**
     * Whole floor with live status, open order value, and how long the table has been sitting.
     *
     * @return list<array<string, mixed>>
     */
    public function floor(int $tenantId, ?int $branchId = null): array
    {
        $tables = CafeTable::query()
            ->where('tenant_id', $tenantId)
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->with('branch:id,name_fa,name_en,slug')
            // Ordered by room first, so the board's grid follows the building rather than the
            // alphabet: a waiter walks one hall at a time.
            ->orderBy('area')
            ->orderBy('sort_order')
            ->orderBy('code')
            ->get();

        $live = $this->liveOrdersByTable($tenantId, $branchId);

        return $tables->map(function (CafeTable $table) use ($live) {
            $code = (string) $table->code;
            $orders = $live->get($code, collect());

            return $this->present($table, $orders);
        })->all();
    }

    /**
     * Orders grouped by the table code they were placed at.
     *
     * @return Collection<string, Collection<int, Order>>
     */
    public function liveOrdersByTable(int $tenantId, ?int $branchId = null): Collection
    {
        // Orders carry no branch_id: a table code is only unique within a branch, so when a
        // branch is selected we narrow by the table codes belonging to that branch instead.
        $codes = null;
        if ($branchId) {
            $codes = CafeTable::query()
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->pluck('code')
                ->all();
        }

        return Order::query()
            ->where('tenant_id', $tenantId)
            ->when($codes !== null, fn ($q) => $q->whereIn('table_number', $codes ?: ['__none__']))
            ->whereNotNull('table_number')
            ->whereNotIn('status', self::DEAD_ORDER_STATUSES)
            ->whereIn('status', self::OPEN_ORDER_STATUSES)
            // Only today matters for a floor board.
            ->where('created_at', '>=', now()->subHours(18))
            ->orderBy('created_at')
            ->get()
            ->groupBy(fn (Order $order) => (string) $order->table_number);
    }

    /**
     * @param  Collection<int, Order>  $orders
     * @return array<string, mixed>
     */
    public function present(CafeTable $table, Collection $orders): array
    {
        $openOrders = $orders->filter(fn (Order $order) => ! in_array((string) $order->status, self::DEAD_ORDER_STATUSES, true));

        $openTotal = (int) $openOrders->sum(fn (Order $order) => (int) $order->total_minor);
        $latest = $openOrders->sortByDesc('created_at')->first();

        $stored = (string) ($table->status ?: CafeTable::STATUS_FREE);
        $seatedMinutes = $this->seatedMinutes($openOrders, $table);
        // What the till is still owed at this table. Shown next to the open total because the
        // two are different numbers the moment part of a bill has been paid.
        $unsettledMinor = (int) $openOrders
            ->filter(fn (Order $order) => $this->isUnsettled($order))
            ->sum(fn (Order $order) => (int) $order->total_minor);
        $derived = $this->deriveStatus($stored, $openOrders, $seatedMinutes);

        return [
            'id' => $table->id,
            'code' => (string) $table->code,
            'label' => $table->label,
            // Grouping the board by room is what makes a twenty-table floor readable.
            'area' => $table->area,
            'seats' => (int) $table->seats,
            'is_active' => (bool) $table->is_active,
            'status' => $derived,
            'stored_status' => $stored,
            'status_changed_at' => optional($table->status_changed_at)->toIso8601String(),
            'occupied' => in_array($derived, CafeTable::OCCUPIED_STATUSES, true),
            'open_orders' => $openOrders->count(),
            'open_total_minor' => $openTotal,
            'active_order_id' => $table->active_order_id ?: optional($latest)->id,
            'oldest_order_at' => optional($openOrders->sortBy('created_at')->first())->created_at?->toIso8601String(),
            'seated_minutes' => $seatedMinutes,
            // Bill printed, money not in yet. The waiter's queue, as opposed to the kitchen's.
            'awaiting_settlement' => $derived === CafeTable::STATUS_AWAITING_SETTLEMENT,
            // Same table, still open long after it should have been paid.
            'overdue' => $derived === CafeTable::STATUS_OVERDUE,
            'overdue_after_minutes' => self::OVERDUE_AFTER_MINUTES,
            'unsettled_minor' => $unsettledMinor,
            'reservation_name' => $table->reservation_name,
            'reserved_for_at' => optional($table->reserved_for_at)->toIso8601String(),
            'branch' => $table->relationLoaded('branch') && $table->branch
                ? ['id' => $table->branch->id, 'name' => $table->branch->name_fa ?: $table->branch->name_en]
                : null,
        ];
    }

    /**
     * Reconcile the stored/override status against the orders actually open on the table.
     *
     * @param  Collection<int, Order>  $openOrders
     */
    private function deriveStatus(string $stored, Collection $openOrders, ?int $seatedMinutes = null): string
    {
        // Cleaning and reserved are deliberate states a waiter set; do not guess over them.
        if ($stored === CafeTable::STATUS_CLEANING || $stored === CafeTable::STATUS_RESERVED) {
            return $stored;
        }

        if ($openOrders->isEmpty()) {
            // Nothing open: a table left "seated" or "served" has been settled and should clear.
            // Cleaning is preserved above, so this does not wipe a deliberate dirty-table mark.
            return CafeTable::STATUS_FREE;
        }

        // An order still being taken means the guests are ordering; anything further along has
        // been served to them at least once.
        $awaitingKitchen = $openOrders->contains(
            fn (Order $order) => in_array((string) $order->status, ['pending', 'paid', 'processing', 'preparing', 'ready'], true)
        );

        if ($awaitingKitchen) {
            return CafeTable::STATUS_ORDERING;
        }

        // The food is out and nothing is on its way. What is left is the bill, which is a
        // different job from "served" — it belongs to the till, not the kitchen.
        $everythingServed = $openOrders->every(
            fn (Order $order) => in_array((string) $order->status, ['served', 'completed', 'shipped', 'out_for_delivery'], true),
        );

        if (! $everythingServed) {
            return CafeTable::STATUS_SERVED;
        }

        // `paid_at` is the honest signal that money arrived (OrderStatusService stamps it once,
        // and nothing resets it). Without it, a table whose guests are finished eating and whose
        // bill is unpaid looked exactly like one that had already paid.
        $unsettled = $openOrders->filter(fn (Order $order) => $this->isUnsettled($order));

        if ((int) $unsettled->sum(fn (Order $order) => (int) $order->total_minor) <= 0) {
            return CafeTable::STATUS_SERVED;
        }

        // Past the late threshold it is not merely awaiting settlement, it is a table nobody has
        // collected from — the one thing a floor board should shout about.
        if ($seatedMinutes !== null && $seatedMinutes >= self::OVERDUE_AFTER_MINUTES) {
            return CafeTable::STATUS_OVERDUE;
        }

        return CafeTable::STATUS_AWAITING_SETTLEMENT;
    }

    /**
     * How long the guests have been at the table, in minutes.
     *
     * @param  Collection<int, Order>  $openOrders
     */
    private function seatedMinutes(Collection $openOrders, CafeTable $table): ?int
    {
        $first = $openOrders->sortBy('created_at')->first();
        $since = $first?->created_at ?? $table->status_changed_at;

        if (! $since) {
            return null;
        }

        return max(0, (int) $since->diffInMinutes(now()));
    }
}
