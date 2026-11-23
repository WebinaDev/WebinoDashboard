<?php

namespace App\Services\Cafe;

use App\Models\CafeTable;
use App\Models\Order;

/**
 * The prioritized queue a shift actually works from.
 *
 * Two rules decide the order, and both come from the floor rather than from a database:
 *  - money waiting to be taken outranks food waiting to be cooked, because the guest is
 *    standing at the counter holding a card;
 *  - the older the ticket, the more urgent it is, regardless of type.
 *
 * `kind` is what the UI filters on to give each role its own queue: a cashier sees
 * `settle` work, a waiter sees `table` and `ready`, a cook sees `cook`.
 */
final class WorkbenchService
{
    /** Queue lanes, most urgent first. */
    public const KIND_SETTLE = 'settle';   // served, waiting for payment

    public const KIND_LATE = 'late';       // past its promised time

    public const KIND_TABLE = 'table';     // seated/ordering, nothing sent to kitchen yet

    public const KIND_READY = 'ready';     // cooked, waiting to be carried

    public const KIND_COOK = 'cook';       // in the kitchen, not yet started

    public const KIND_DELIVERY = 'delivery'; // out with a courier

    public function __construct(
        private readonly OperationsSettings $settings,
        private readonly CafeFloorService $floor,
    ) {}

    /**
     * The queue, most urgent first.
     *
     * @return array<int, array<string, mixed>>
     */
    public function queue(int $tenantId, ?int $branchId, ?string $role = null): array
    {
        $cfg = $this->settings->get($tenantId);
        $now = now();

        $orders = Order::query()
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->whereIn('status', ['paid', 'processing', 'prepared', 'ready', 'served'])
            ->where('created_at', '>=', $now->copy()->subHours(18))
            ->with(['items.product:id,name,category_id', 'branch:id,name_fa'])
            ->orderBy('created_at')
            ->limit(200)
            ->get();

        // An order points at its table by *code* (`table_number`), not by id: the guest QR
        // flow and the floor board both work from the code, and a code is unique per tenant
        // while `table_id` was never added to `orders`. One lookup for the page beats a
        // per-row query, and it keeps a deleted table from breaking the whole queue.
        $tables = CafeTable::query()
            ->where('tenant_id', $tenantId)
            ->with('branch:id,name_fa')
            ->get()
            ->keyBy(fn (CafeTable $table): string => (string) $table->code);

        $items = [];

        foreach ($orders as $order) {
            $meta = is_array($order->meta) ? $order->meta : [];
            $kitchen = (string) ($meta['kitchen_status'] ?? 'new');
            $ageMinutes = (int) $order->created_at?->diffInMinutes($now);
            $unpaid = ! $this->looksPaid($order);

            $kinds = [];
            $weight = 0;

            // Money first.
            if ($unpaid && in_array($kitchen, ['ready', 'served'], true)) {
                $kinds[] = self::KIND_SETTLE;
                $weight = max($weight, 100);
            }

            // Food waiting under the pass.
            if ($kitchen === 'ready') {
                $kinds[] = self::KIND_READY;
                $weight = max($weight, 80);
            }

            // Nothing sent to the kitchen yet.
            if ($kitchen === 'new' && $unpaid === false) {
                $kinds[] = self::KIND_COOK;
                $weight = max($weight, 50);
            }

            // Out with a courier.
            if (! empty($meta['delivery']['claimed_at']) || ($meta['fulfillment'] ?? null) === 'delivery') {
                $kinds[] = self::KIND_DELIVERY;
                $weight = max($weight, 60);
            }

            // Past its promise.
            $lateAfter = (int) ($cfg['kds_late_after_minutes'] ?? 20);
            if ($ageMinutes >= $lateAfter && $kitchen !== 'served') {
                $kinds[] = self::KIND_LATE;
                $weight = max($weight, 120);
            }

            if ($kinds === []) {
                continue;
            }

            $code = trim((string) ($order->table_number ?? ''));
            $table = $code !== '' ? $tables->get($code) : null;

            $items[] = [
                'kind' => $kinds[0],
                'kinds' => array_values(array_unique($kinds)),
                'weight' => $weight + min(59, $ageMinutes), // older is more urgent, capped so age cannot dominate alone
                'order_id' => $order->id,
                'number' => $order->number,
                'status' => $order->status,
                'kitchen_status' => $kitchen,
                // Present the code even when the table row is gone, so a delivery order taken
                // before a table was retired still tells the cashier where it was.
                'table' => $code === '' ? null : [
                    'id' => $table?->id,
                    'code' => $table?->code ?? $code,
                    'label' => $table?->label,
                ],
                'branch' => $order->branch?->name_fa ?? $table?->branch?->name_fa,
                'total_minor' => (int) $order->total_minor,
                'unpaid' => $unpaid,
                'age_minutes' => $ageMinutes,
                'late' => in_array(self::KIND_LATE, $kinds, true),
                'fulfillment' => $meta['fulfillment'] ?? 'dine_in',
                'item_count' => $order->items->count(),
                'created_at' => $order->created_at?->toIso8601String(),
            ];
        }

        // Tables that are open but have no order yet — a waiter's real to-do list.
        foreach ($this->idleTables($tenantId, $branchId) as $table) {
            $items[] = $table;
        }

        $filtered = $role === null ? $items : $this->forRole($items, $role);

        usort($filtered, fn (array $a, array $b): int => $b['weight'] <=> $a['weight']);

        return $filtered;
    }

    /**
     * Keep only the lanes a role owns.
     *
     * A cashier's queue is money and nothing else; a waiter works tables and the pass; a
     * cook only sees food. Anyone unrecognised (manager, owner) gets everything.
     *
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array<string, mixed>>
     */
    private function forRole(array $items, string $role): array
    {
        $lanes = match ($role) {
            'cashier' => [self::KIND_SETTLE, self::KIND_LATE],
            'waiter' => [self::KIND_TABLE, self::KIND_READY, self::KIND_LATE],
            'cook' => [self::KIND_COOK, self::KIND_LATE],
            'courier' => [self::KIND_DELIVERY],
            default => null,
        };

        if ($lanes === null) {
            return $items;
        }

        return array_values(array_filter(
            $items,
            fn (array $item): bool => array_intersect($item['kinds'] ?? [$item['kind']], $lanes) !== [],
        ));
    }

    /**
     * Tables that have been seated or reserved but have no open order.
     *
     * @return array<int, array<string, mixed>>
     */
    private function idleTables(int $tenantId, ?int $branchId): array
    {
        $cfg = $this->settings->get($tenantId);
        $overdueAfter = (int) ($cfg['table_overdue_after_minutes'] ?? 90);

        $tables = CafeTable::query()
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->where('is_active', true)
            ->whereIn('status', [CafeTable::STATUS_SEATED, CafeTable::STATUS_ORDERING, CafeTable::STATUS_RESERVED])
            ->get();

        $out = [];

        foreach ($tables as $table) {
            $since = $table->status_changed_at ?? $table->updated_at;
            $minutes = $since ? max(0, (int) $since->diffInMinutes(now())) : 0;
            $overdue = $table->status === CafeTable::STATUS_SEATED && $minutes >= $overdueAfter;

            $out[] = [
                'kind' => self::KIND_TABLE,
                'kinds' => $overdue ? [self::KIND_TABLE, self::KIND_LATE] : [self::KIND_TABLE],
                // A seated table with no order is urgent; a reservation is not.
                'weight' => ($overdue ? 90 : ($table->status === CafeTable::STATUS_SEATED ? 45 : 25)) + min(40, $minutes),
                'order_id' => null,
                'table_id' => $table->id,
                'number' => null,
                'status' => null,
                'kitchen_status' => null,
                'table' => [
                    'id' => $table->id,
                    'code' => $table->code,
                    'label' => $table->label,
                ],
                'branch' => null,
                'total_minor' => 0,
                'unpaid' => false,
                'age_minutes' => $minutes,
                'late' => $overdue,
                'fulfillment' => 'dine_in',
                'item_count' => 0,
                'created_at' => $since?->toIso8601String(),
            ];
        }

        return $out;
    }

    /**
     * Whether payment has been taken, without treating every tenderless order as unpaid.
     *
     * Online and pay-link orders legitimately have no tender yet; those belong to the
     * gateway flow, not to the cashier's settle queue.
     */
    private function looksPaid(Order $order): bool
    {
        if ($order->amount_paid_minor !== null && (int) $order->amount_paid_minor >= (int) $order->total_minor) {
            return true;
        }

        if (! empty($order->payment_tender)) {
            return true;
        }

        // A dine-in order created by staff is paid on the spot in this flow.
        $meta = is_array($order->meta) ? $order->meta : [];

        return ($meta['settled'] ?? false) === true;
    }

    /**
     * Live table map, coloured by the state the guest is actually in.
     *
     * Adds the two colours the floor board was missing: `awaiting_settle` (food done, bill
     * open) and `overdue` (seated too long). Both are derived, never stored.
     *
     * @return array<string, mixed>
     */
    public function floorMap(int $tenantId, ?int $branchId): array
    {
        $cfg = $this->settings->get($tenantId);
        $overdueAfter = (int) ($cfg['table_overdue_after_minutes'] ?? 90);

        $rows = $this->floor->floor($tenantId, $branchId);

        $tables = array_map(function (array $table) use ($overdueAfter): array {
            $status = (string) ($table['status'] ?? CafeTable::STATUS_FREE);
            $seated = (int) ($table['seated_minutes'] ?? 0);
            $derived = $status;

            if (in_array($status, CafeTable::OCCUPIED_STATUSES, true)) {
                if ($seated >= $overdueAfter) {
                    $derived = 'overdue';
                } elseif ($status === CafeTable::STATUS_SERVED) {
                    // Served and still open: the guest is waiting for the bill.
                    $derived = 'awaiting_settle';
                }
            }

            return array_merge($table, [
                'display_status' => $derived,
                'overdue' => $derived === 'overdue',
            ]);
        }, $rows);

        $counts = [];
        foreach (['free', 'seated', 'ordering', 'served', 'reserved', 'cleaning', 'awaiting_settle', 'overdue'] as $key) {
            $counts[$key] = count(array_filter($tables, fn (array $t): bool => ($t['display_status'] ?? '') === $key));
        }

        return ['tables' => $tables, 'counts' => $counts];
    }
}
