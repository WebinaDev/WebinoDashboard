<?php

namespace App\Services\Cafe;

use App\Models\CafeShift;
use App\Models\CafeTable;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\Reports\OrderReports;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Manager KPI board.
 *
 * Everything here is read-only and derived from the same sales-status definition the existing
 * order reports use, so the numbers on this screen match the rest of the admin rather than
 * quietly disagreeing because of a second, hand-rolled definition of "paid".
 */
class CafeManagerService
{
    /** Sales figures exclude anything the reports already exclude. */
    private function salesStatuses(): array
    {
        return OrderReports::salesStatuses();
    }

    /**
     * @return array<string, mixed>
     */
    public function overview(int $tenantId, string $range = 'today'): array
    {
        [$from, $to] = $this->window($range);

        $base = fn () => Order::query()
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$from, $to]);

        $sales = $base()->whereIn('status', $this->salesStatuses());
        $ordersCount = (int) (clone $sales)->count();
        $revenue = (int) (clone $sales)->sum('total_minor');

        $aov = $ordersCount > 0 ? (int) round($revenue / $ordersCount) : 0;

        return [
            'range' => $range,
            'window' => ['from' => $from->toIso8601String(), 'to' => $to->toIso8601String()],
            'currency' => 'IRT',
            'sales' => [
                'orders' => $ordersCount,
                'revenue_minor' => $revenue,
                'aov_minor' => $aov,
                'discounts_minor' => (int) (clone $sales)->sum('discount_minor'),
                'tax_minor' => (int) (clone $sales)->sum('tax_minor'),
                'shipping_minor' => (int) (clone $sales)->sum('shipping_minor'),
            ],
            'channels' => $this->channelBreakdown($base(), $this->salesStatuses()),
            'statuses' => $this->statusCounts($base()),
            'tables' => $this->tableSnapshot($tenantId),
            'delivery' => $this->deliverySnapshot($tenantId),
            'tills' => $this->tillSnapshot($tenantId),
            'top_items' => $this->topItems($tenantId, $from, $to),
            'hourly' => $this->hourly($base(), $this->salesStatuses()),
        ];
    }

    /**
     * Accept a handful of named ranges plus anything the UI can pass through.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    private function window(string $range): array
    {
        $now = now();

        return match ($range) {
            'week' => [$now->copy()->startOfWeek(), $now->copy()->endOfWeek()],
            'month' => [$now->copy()->startOfMonth(), $now->copy()->endOfMonth()],
            'last7' => [$now->copy()->subDays(6)->startOfDay(), $now->copy()->endOfDay()],
            'last30' => [$now->copy()->subDays(29)->startOfDay(), $now->copy()->endOfDay()],
            default => [$now->copy()->startOfDay(), $now->copy()->endOfDay()],
        };
    }

    /**
     * Revenue split by tender, so the manager can see how much cash is actually in play.
     *
     * @param  list<string>  $statuses
     * @return list<array<string, mixed>>
     */
    private function channelBreakdown($base, array $statuses): array
    {
        $rows = $base
            ->whereIn('status', $statuses)
            ->select('payment_tender', DB::raw('count(*) as orders'), DB::raw('sum(total_minor) as amount'))
            ->groupBy('payment_tender')
            ->get();

        return $rows->map(fn ($row) => [
            'tender' => $row->payment_tender ?: 'unspecified',
            'orders' => (int) $row->orders,
            'amount_minor' => (int) $row->amount,
        ])->values()->all();
    }

    /**
     * @return array<string, int>
     */
    private function statusCounts($base): array
    {
        $rows = $base->select('status', DB::raw('count(*) as total'))->groupBy('status')->get();

        $counts = [];
        foreach ($rows as $row) {
            $counts[(string) $row->status] = (int) $row->total;
        }

        return $counts;
    }

    /**
     * @return array<string, int|float>
     */
    private function tableSnapshot(int $tenantId): array
    {
        $tables = CafeTable::query()->where('tenant_id', $tenantId)->get();
        $occupied = $tables->filter(fn (CafeTable $table) => $table->isOccupied())->count();
        $seats = (int) $tables->sum('seats');
        $seatedSeats = (int) $tables->filter(fn (CafeTable $table) => $table->isOccupied())->sum('seats');

        return [
            'total' => $tables->count(),
            'occupied' => $occupied,
            'seats' => $seats,
            'seated_seats' => $seatedSeats,
            'occupancy_percent' => $tables->count() > 0
                ? (int) round(($occupied / max(1, $tables->count())) * 100)
                : 0,
            'seat_utilization_percent' => $seats > 0 ? (int) round(($seatedSeats / $seats) * 100) : 0,
        ];
    }

    /**
     * @return array<string, int>
     */
    private function deliverySnapshot(int $tenantId): array
    {
        $rows = Order::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('delivery_status')
            ->where('created_at', '>=', now()->subDays(7))
            ->select('delivery_status', DB::raw('count(*) as total'))
            ->groupBy('delivery_status')
            ->get();

        $counts = [
            'queued' => 0,
            'claimed' => 0,
            'picked_up' => 0,
            'delivered' => 0,
            'failed' => 0,
        ];

        foreach ($rows as $row) {
            $counts[(string) $row->delivery_status] = (int) $row->total;
        }

        $counts['active'] = $counts['claimed'] + $counts['picked_up'];

        return $counts;
    }

    /**
     * Today's till position: what is open, and what has been counted out.
     *
     * @return array<string, mixed>
     */
    private function tillSnapshot(int $tenantId): array
    {
        $today = [now()->startOfDay(), now()->endOfDay()];

        $open = CafeShift::query()
            ->where('tenant_id', $tenantId)
            ->where('status', CafeShift::STATUS_OPEN)
            ->count();

        $closed = CafeShift::query()
            ->where('tenant_id', $tenantId)
            ->where('status', CafeShift::STATUS_CLOSED)
            ->whereBetween('closed_at', $today)
            ->get(['variance_minor']);

        return [
            'open_shifts' => $open,
            'closed_today' => $closed->count(),
            // Signed: negative means the drawers were collectively short today.
            'variance_minor' => (int) $closed->sum(fn ($shift) => (int) $shift->variance_minor),
            'shifts_with_variance' => $closed->filter(fn ($shift) => (int) $shift->variance_minor !== 0)->count(),
        ];
    }

    /**
     * Best sellers by quantity, which is what a kitchen actually stocks against.
     *
     * @return list<array<string, mixed>>
     */
    private function topItems(int $tenantId, Carbon $from, Carbon $to): array
    {
        $rows = OrderItem::query()
            ->whereHas('order', function ($q) use ($tenantId, $from, $to) {
                $q->where('tenant_id', $tenantId)
                    ->whereIn('status', $this->salesStatuses())
                    ->whereBetween('created_at', [$from, $to]);
            })
            ->select(
                'product_name',
                DB::raw('sum(quantity) as qty'),
                DB::raw('sum(quantity * unit_price_minor) as amount')
            )
            ->groupBy('product_name')
            ->orderByDesc('qty')
            ->limit(8)
            ->get();

        return $rows->map(fn ($row) => [
            'name' => $row->product_name ?: '-',
            'quantity' => (int) $row->qty,
            'amount_minor' => (int) $row->amount,
        ])->values()->all();
    }

    /**
     * Sales by hour of day, so staffing can follow the rush instead of guessing.
     *
     * @return list<array<string, mixed>>
     */
    private function hourly($base, array $statuses): array
    {
        $rows = $base
            ->whereIn('status', $statuses)
            ->selectRaw('HOUR(created_at) as hour, count(*) as orders, sum(total_minor) as amount')
            ->groupBy('hour')
            ->orderBy('hour')
            ->get();

        $byHour = [];
        foreach ($rows as $row) {
            $byHour[(int) $row->hour] = [
                'hour' => (int) $row->hour,
                'orders' => (int) $row->orders,
                'amount_minor' => (int) $row->amount,
            ];
        }

        return array_values($byHour);
    }
}
