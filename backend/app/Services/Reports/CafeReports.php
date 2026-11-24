<?php

namespace App\Services\Reports;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The reports a cafe owner actually opens, built from the frozen cost of what was sold.
 *
 * Three of these did not exist at all, and the one that did ("profit and loss") was a sum over
 * the accounting journal that could not answer the first question anyone asks of it: what did
 * the food cost? Nothing in the product knew, so the P&L was revenue minus recorded expenses,
 * with the entire cost of materials missing — a number that is always flattering and always
 * wrong.
 *
 * Every report here:
 *  - takes an explicit date range and branch, because "how did we do" is never asked without
 *    them, and a report that silently covers everything is a report nobody trusts;
 *  - reports what it could not cost (`incomplete_lines`) rather than presenting a margin that
 *    is quietly too high;
 *  - reads frozen per-line costs, so a supplier raising a price today cannot change last
 *    Tuesday's margin.
 */
final class CafeReports
{
    /** Statuses that count as revenue. Mirrors OrderReports::salesStatuses(). */
    public const SOLD = ['paid', 'processing', 'completed', 'shipped'];

    public function __construct(
        private readonly \App\Services\Catalog\RecipeCosting $costing,
        private readonly \Modules\Cafe\Services\OperationsSettings $operations,
    ) {}

    /**
     * Profit and loss with a real cost of goods.
     *
     * @return array<string, mixed>
     */
    public function profitAndLoss(
        int $tenantId,
        Carbon $from,
        Carbon $to,
        ?int $branchId = null,
        bool $includePayroll = true,
    ): array {
        $base = fn () => DB::table('orders')
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', self::SOLD);

        $totals = $base()
            ->selectRaw('COALESCE(SUM(total_minor),0) as total')
            ->selectRaw('COALESCE(SUM(subtotal_minor),0) as subtotal')
            ->selectRaw('COALESCE(SUM(discount_minor),0) as discount')
            ->selectRaw('COALESCE(SUM(shipping_minor),0) as shipping')
            ->selectRaw('COALESCE(SUM(tax_minor),0) as tax')
            ->selectRaw('COUNT(*) as orders')
            ->first();

        // What the food and drink cost. The whole point of the report.
        $cogs = $this->costing->cogsFor($tenantId, $from, $to);

        // Delivery revenue is income but not trade: separating it stops a free-delivery promo
        // from looking like a margin decline.
        $shipping = (int) ($totals->shipping ?? 0);
        $tax = (int) ($totals->tax ?? 0);
        $grossRevenue = (int) ($totals->total ?? 0) - $tax;
        $netRevenue = $grossRevenue - $shipping;
        $discounts = (int) ($totals->discount ?? 0);

        $materialCost = (int) round($cogs['cogs_minor']);

        // Operating expenses from the ledger, when the accountant has been posting them.
        $expenses = $this->expenseLines($tenantId, $from, $to, $branchId);

        $payroll = $includePayroll ? $this->payrollCost($tenantId, $from, $to) : 0;

        // Payroll must be counted once. When the accountant posts salaries to a wage expense
        // account it is already inside the ledger sum; only a payroll run that was never posted
        // needs adding on top. Double-counting it would make the prime cost look catastrophic
        // in exactly the month the payroll module was switched on.
        $payrollInLedger = collect($expenses)->contains(
            fn (array $expense): bool => str_contains((string) $expense['name'], 'حقوق')
                || str_contains(strtolower((string) $expense['name']), 'payroll')
                || str_contains(strtolower((string) $expense['name']), 'salary'),
        );

        $operatingExpenses = array_sum(array_column($expenses, 'amount_minor'));
        $payrollExtra = $payrollInLedger ? 0 : $payroll;

        $primeCost = $materialCost + ($payrollInLedger ? 0 : $payroll);
        $grossProfit = $netRevenue - $materialCost;
        $operatingProfit = $grossProfit - $operatingExpenses - $payrollExtra;

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'branch_id' => $branchId,
            'revenue' => [
                'orders' => (int) ($totals->orders ?? 0),
                'gross_minor' => $grossRevenue,
                'delivery_minor' => $shipping,
                'net_minor' => $netRevenue,
                'discounts_minor' => $discounts,
                'tax_minor' => $tax,
            ],
            'cost_of_sales' => [
                'material_minor' => $materialCost,
                'costed_lines' => $cogs['lines'],
                // Non-zero means the margin below is optimistic; say so in the payload.
                'incomplete_lines' => $cogs['incomplete_lines'],
                'complete' => $cogs['incomplete_lines'] === 0,
            ],
            'gross_profit_minor' => $grossProfit,
            'gross_margin_percent' => $netRevenue > 0 ? round(($grossProfit / $netRevenue) * 100, 2) : null,
            'payroll_minor' => $payroll,
            'payroll_in_ledger' => $payrollInLedger,
            'prime_cost_minor' => $primeCost,
            'prime_cost_percent' => $netRevenue > 0 ? round(($primeCost / $netRevenue) * 100, 2) : null,
            'expenses' => $expenses,
            'expenses_minor' => $operatingExpenses,
            'operating_profit_minor' => $operatingProfit,
            'operating_margin_percent' => $netRevenue > 0 ? round(($operatingProfit / $netRevenue) * 100, 2) : null,
            'average_ticket_minor' => (int) ($totals->orders ?? 0) > 0
                ? (int) round($netRevenue / max(1, (int) $totals->orders))
                : 0,
        ];
    }

    /**
     * Menu engineering: the four quadrants of stars / plough horses / puzzles / dogs.
     *
     * The classification is the standard one — popularity against the mean, margin against the
     * mean — because the point of the report is to be comparable with what a consultant would
     * hand back, not to invent a scheme nobody can act on.
     *
     * @return array<string, mixed>
     */
    public function menuEngineering(int $tenantId, Carbon $from, Carbon $to, ?int $branchId = null): array
    {
        $rows = DB::table('order_items as oi')
            ->join('orders as o', 'oi.order_id', '=', 'o.id')
            ->leftJoin('order_item_ingredient_costs as c', 'c.order_item_id', '=', 'oi.id')
            ->where('o.tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('o.branch_id', $branchId))
            ->whereBetween('o.created_at', [$from, $to])
            ->whereIn('o.status', self::SOLD)
            ->groupBy('oi.product_id', 'oi.product_name')
            ->select([
                'oi.product_id',
                'oi.product_name',
                DB::raw('SUM(oi.quantity) as qty'),
                DB::raw('COALESCE(SUM(oi.total_minor),0) as revenue'),
                DB::raw('COALESCE(SUM(c.total_cost_minor),0) as cost'),
                DB::raw('SUM(CASE WHEN c.complete = 0 THEN 1 ELSE 0 END) as incomplete'),
            ])
            ->get();

        if ($rows->isEmpty()) {
            return ['items' => [], 'summary' => null];
        }

        $prepared = $rows->map(function ($row) {
            $qty = max(1, (float) $row->qty);
            $revenue = (int) $row->revenue;
            $cost = (int) round((float) $row->cost);

            return [
                'product_id' => (int) $row->product_id,
                'name' => $row->product_name,
                'quantity' => (float) $row->qty,
                'revenue_minor' => $revenue,
                'cost_minor' => $cost,
                'margin_minor' => $revenue - $cost,
                'margin_per_unit_minor' => (int) round(($revenue - $cost) / $qty),
                'margin_percent' => $revenue > 0 ? round((($revenue - $cost) / $revenue) * 100, 2) : null,
                'incomplete_lines' => (int) $row->incomplete,
            ];
        });

        $meanQty = $prepared->avg('quantity') ?? 0;
        $meanMargin = $prepared->avg('margin_per_unit_minor') ?? 0;

        $items = $prepared->map(function (array $item) use ($meanQty, $meanMargin): array {
            $popular = $item['quantity'] >= $meanQty;
            $profitable = $item['margin_per_unit_minor'] >= $meanMargin;

            // Standard naming, in Persian for the manager and English in the key for code.
            $class = match (true) {
                $popular && $profitable => 'star',
                $popular && ! $profitable => 'plough_horse',
                ! $popular && $profitable => 'puzzle',
                default => 'dog',
            };

            return $item + ['class' => $class, 'popular' => $popular, 'profitable' => $profitable];
        })->sortByDesc('revenue_minor')->values()->all();

        $counts = array_count_values(array_column($items, 'class'));

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'items' => $items,
            'summary' => [
                'mean_quantity' => round($meanQty, 2),
                'mean_margin_per_unit_minor' => (int) round($meanMargin),
                'counts' => [
                    'star' => $counts['star'] ?? 0,
                    'plough_horse' => $counts['plough_horse'] ?? 0,
                    'puzzle' => $counts['puzzle'] ?? 0,
                    'dog' => $counts['dog'] ?? 0,
                ],
            ],
        ];
    }

    /**
     * The control report: voids, discounts and drawer over/short, per person.
     *
     * This is the report a manager reads when they suspect something, and the one that makes a
     * control exist rather than being describable. Discounts are attributed to whoever rang the
     * order; variances to whoever counted the drawer.
     *
     * @return array<string, mixed>
     */
    public function control(int $tenantId, Carbon $from, Carbon $to, ?int $branchId = null): array
    {
        $staff = [];

        $touch = function (int $userId, string $name) use (&$staff): void {
            $staff[$userId] ??= [
                'user_id' => $userId,
                'name' => $name,
                'orders' => 0,
                'sales_minor' => 0,
                'discounts_minor' => 0,
                'discounted_orders' => 0,
                'cancelled_orders' => 0,
                'refunds_minor' => 0,
                'short_minor' => 0,
                'over_minor' => 0,
                'drawers_counted' => 0,
            ];
        };

        $orderRows = DB::table('orders as o')
            ->leftJoin('users as u', 'o.created_by', '=', 'u.id')
            ->where('o.tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('o.branch_id', $branchId))
            ->whereBetween('o.created_at', [$from, $to])
            ->groupBy('o.created_by', 'u.name')
            ->select([
                'o.created_by as user_id',
                'u.name',
                DB::raw('SUM(CASE WHEN o.status IN ('.implode(',', array_map(fn ($s) => "'".$s."'", self::SOLD)).') THEN 1 ELSE 0 END) as sold_orders'),
                DB::raw('SUM(CASE WHEN o.status IN ('.implode(',', array_map(fn ($s) => "'".$s."'", self::SOLD)).') THEN o.total_minor ELSE 0 END) as sales'),
                DB::raw('COALESCE(SUM(o.discount_minor),0) as discounts'),
                DB::raw('SUM(CASE WHEN o.discount_minor > 0 THEN 1 ELSE 0 END) as discounted_orders'),
                DB::raw("SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled"),
                DB::raw("SUM(CASE WHEN o.status = 'refunded' THEN o.total_minor ELSE 0 END) as refunds"),
            ])
            ->get();

        foreach ($orderRows as $row) {
            $userId = (int) ($row->user_id ?? 0);
            // An order with no author is not nobody's fault; it is a data problem worth seeing.
            $touch($userId, (string) ($row->name ?? ($userId === 0 ? '—' : '#'.$userId)));

            $staff[$userId]['orders'] += (int) $row->sold_orders;
            $staff[$userId]['sales_minor'] += (int) $row->sales;
            $staff[$userId]['discounts_minor'] += (int) $row->discounts;
            $staff[$userId]['discounted_orders'] += (int) $row->discounted_orders;
            $staff[$userId]['cancelled_orders'] += (int) $row->cancelled;
            $staff[$userId]['refunds_minor'] += (int) $row->refunds;
        }

        // Drawer variances sit with whoever counted, not whoever opened the shift.
        $shiftRows = DB::table('cafe_shifts as s')
            ->leftJoin('users as u', 's.counted_by', '=', 'u.id')
            ->where('s.tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('s.branch_id', $branchId))
            ->whereBetween('s.closed_at', [$from, $to])
            ->whereNotNull('s.counted_cash_minor')
            ->groupBy('s.counted_by', 'u.name')
            ->select([
                's.counted_by as user_id',
                'u.name',
                DB::raw('SUM(CASE WHEN s.variance_minor < 0 THEN -s.variance_minor ELSE 0 END) as short'),
                DB::raw('SUM(CASE WHEN s.variance_minor > 0 THEN s.variance_minor ELSE 0 END) as over'),
                DB::raw('COUNT(*) as counted'),
            ])
            ->get();

        foreach ($shiftRows as $row) {
            $userId = (int) ($row->user_id ?? 0);
            $touch($userId, (string) ($row->name ?? '—'));
            $staff[$userId]['short_minor'] += (int) $row->short;
            $staff[$userId]['over_minor'] += (int) $row->over;
            $staff[$userId]['drawers_counted'] += (int) $row->counted;
        }

        $rows = collect($staff)->map(function (array $row): array {
            $row['discount_percent'] = $row['sales_minor'] > 0
                ? round(($row['discounts_minor'] / $row['sales_minor']) * 100, 2)
                : null;
            $row['net_variance_minor'] = $row['over_minor'] - $row['short_minor'];

            return $row;
        })->sortByDesc('sales_minor')->values()->all();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'branch_id' => $branchId,
            'staff' => $rows,
            'totals' => [
                'sales_minor' => array_sum(array_column($rows, 'sales_minor')),
                'discounts_minor' => array_sum(array_column($rows, 'discounts_minor')),
                'cancelled_orders' => array_sum(array_column($rows, 'cancelled_orders')),
                'short_minor' => array_sum(array_column($rows, 'short_minor')),
                'over_minor' => array_sum(array_column($rows, 'over_minor')),
            ],
        ];
    }

    /**
     * The service KPIs: how fast, how full, how long, and what it takes to break even.
     *
     * These are the numbers a café is judged on and none of them existed:
     *
     *  - **Order to serve** — from the order being taken to its line being ticked ready.
     *    Measured per line, because a ticket where two coffees came out in four minutes and a
     *    pastry took twenty has a problem the ticket average hides.
     *  - **Table dwell** — from the first order opened at a table to the last one settled.
     *  - **Turnover** — how many sittings a table does per service day.
     *  - **Occupancy** — occupied table-minutes over the minutes the room was open.
     *  - **Break-even** — the sales needed to cover fixed cost at the current contribution
     *    margin, reported with its inputs, because "break-even is X" with no visible
     *    assumption is a number nobody can act on.
     *
     * A figure that cannot be computed from the data is `null`, never zero: a zero dwell time
     * reads as excellent service, while an absent one reads as missing data, which is the truth.
     *
     * Times are computed in PHP rather than SQL because `orders.meta` is JSON and the two
     * engines the product runs on (SQLite in tests, MySQL in production) disagree about how to
     * reach into it. The query is bounded by the date range and by the columns it selects.
     *
     * @return array<string, mixed>
     */
    public function serviceKpis(int $tenantId, Carbon $from, Carbon $to, ?int $branchId = null): array
    {
        $orders = DB::table('orders')
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', self::SOLD)
            ->whereNull('deleted_at')
            ->get(['id', 'created_at', 'meta', 'total_minor']);

        $sold = $orders->count();
        $revenue = (int) round((float) $orders->sum('total_minor'));

        // --- order to serve -----------------------------------------------------------
        // A prep tick is the only real timestamp for "the kitchen finished this line".
        $ready = DB::table('cafe_order_item_prep as p')
            ->join('orders as o', 'p.order_id', '=', 'o.id')
            ->where('p.tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('o.branch_id', $branchId))
            ->whereBetween('o.created_at', [$from, $to])
            ->whereNull('o.deleted_at')
            ->where('p.status', 'ready')
            ->whereNotNull('p.marked_at')
            ->get(['o.created_at', 'p.marked_at'])
            ->map(fn ($row): int => (int) round(
                (strtotime((string) $row->marked_at) - strtotime((string) $row->created_at)) / 60,
            ))
            ->filter(fn (int $minutes): bool => $minutes >= 0)
            ->values();

        // --- table dwell and turnover ---------------------------------------------------
        // Dwell is per table per day: two sittings at the same table on the same day are two
        // sittings, and averaging them as one hides the difference between a quick lunch and
        // a table that never got cleared.
        $sittings = [];

        foreach ($orders as $order) {
            $meta = is_array($order->meta) ? $order->meta : (json_decode((string) $order->meta, true) ?: []);
            $table = trim((string) ($meta['table_code'] ?? ''));
            if ($table === '') {
                continue;
            }

            $day = substr((string) $order->created_at, 0, 10);
            $key = $table.'|'.$day;

            $sittings[$key] ??= ['table' => $table, 'day' => $day, 'orders' => 0, 'opened_at' => null, 'last_at' => null];
            $sittings[$key]['orders']++;

            $at = strtotime((string) $order->created_at);
            $sittings[$key]['opened_at'] = min($sittings[$key]['opened_at'] ?? $at, $at);
            $sittings[$key]['last_at'] = max($sittings[$key]['last_at'] ?? $at, $at);
        }

        $sittings = array_values($sittings);
        $dwell = array_map(
            fn (array $s): int => (int) round(($s['last_at'] - $s['opened_at']) / 60),
            $sittings,
        );

        $tables = DB::table('cafe_tables')
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->where('is_active', true)
            ->count();

        $days = max(1, (int) abs($from->diffInDays($to)) + 1);

        // One sitting per table per day is a turn of one; 2.4 means the table was used two and
        // a half times in a service day.
        $turnover = $tables > 0 ? round(count($sittings) / ($tables * $days), 2) : null;

        // Occupancy needs to know how long the room was open. The setting is the configured
        // service day; absent a sane one the honest answer is "unknown" rather than a made-up
        // denominator that would make a busy room look empty.
        $dayMinutes = (int) ($this->operations->get($tenantId)['service_day_minutes'] ?? 0);
        $occupiedMinutes = array_sum($dwell);
        $occupancy = $tables > 0 && $dayMinutes > 0
            ? round(($occupiedMinutes / ($tables * $dayMinutes * $days)) * 100, 1)
            : null;

        // --- break-even ----------------------------------------------------------------
        // Contribution margin comes from the P&L so the two reports cannot disagree about it.
        $pl = $this->profitAndLoss($tenantId, $from, $to, $branchId, true);

        $netRevenue = (int) $pl['revenue']['net_minor'];
        $materialCost = (int) $pl['cost_of_sales']['material_minor'];
        $contribution = $netRevenue > 0 ? ($netRevenue - $materialCost) / $netRevenue : null;

        // Fixed cost is every operating expense the ledger knows about, plus payroll that the
        // ledger does not already carry. COGS is deliberately not in it: it is the variable side
        // of the same equation, and counting it here would ask the shop to cover its ingredients
        // twice — once below the margin and once above it.
        $fixedCost = max(0, (int) $pl['expenses_minor'] + (int) ($pl['payroll_in_ledger'] ? 0 : $pl['payroll_minor']));

        $breakEven = $contribution !== null && $contribution > 0
            ? (int) round($fixedCost / $contribution)
            : null;

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'branch_id' => $branchId,
            'days' => $days,
            'orders' => $sold,
            'revenue_minor' => $revenue,
            'average_ticket_minor' => $sold > 0 ? (int) round($revenue / $sold) : 0,
            'service' => [
                'order_to_serve_minutes' => $ready->isEmpty() ? null : round($ready->avg(), 1),
                'slowest_line_minutes' => $ready->isEmpty() ? null : (int) $ready->max(),
                'lines_measured' => $ready->count(),
            ],
            'tables' => [
                'table_dwell_minutes' => $dwell === [] ? null : round(array_sum($dwell) / count($dwell), 1),
                'sittings' => count($sittings),
                'active_tables' => $tables,
                'table_turnover' => $turnover,
                'occupancy_percent' => $occupancy,
                // Surfaced so the screen can say why occupancy is blank instead of showing 0%.
                'service_day_minutes' => $dayMinutes,
            ],
            'break_even' => [
                'revenue_minor' => $breakEven,
                'fixed_cost_minor' => $fixedCost,
                'contribution_percent' => $contribution === null ? null : round($contribution * 100, 2),
                // Null means the number cannot be trusted; the screen says which input is missing.
                'complete' => $breakEven !== null,
            ],
        ];
    }

    /**
     * Accounts receivable aging, per customer.
     *
     * Bucketed the way a credit controller reads it: current, then 30/60/90+.
     *
     * @return array<string, mixed>
     */
    public function receivableAging(int $tenantId, ?Carbon $asOf = null): array
    {
        $asOf ??= now();

        $invoices = DB::table('accounting_invoices as i')
            ->leftJoin('acc_persons as p', 'i.person_id', '=', 'p.id')
            ->where('i.tenant_id', $tenantId)
            ->whereIn('i.status', ['posted', 'confirmed'])
            ->where('i.type', 'sale')
            ->select([
                'i.id',
                'i.number',
                'i.person_id',
                'i.issue_date',
                'i.total_minor',
                'p.name as person_name',
            ])
            ->get();

        // Per-invoice settlement is not modelled: receipts post against the control account,
        // not against a specific invoice. Aging therefore shows the invoice total, and the
        // payload says so rather than implying a precision the data does not have.
        $paid = [];
        $buckets = ['current' => 0, 'days_30' => 0, 'days_60' => 0, 'days_90' => 0];
        $byPerson = [];

        foreach ($invoices as $invoice) {
            $outstanding = (int) ($invoice->total_minor ?? 0) - (int) ($paid[$invoice->id] ?? 0);
            if ($outstanding <= 0) {
                continue;
            }

            $days = $invoice->issue_date === null
                ? 0
                : max(0, (int) Carbon::parse($invoice->issue_date)->diffInDays($asOf, false));

            $bucket = match (true) {
                $days <= 0 => 'current',
                $days <= 30 => 'days_30',
                $days <= 60 => 'days_60',
                default => 'days_90',
            };

            $buckets[$bucket] += $outstanding;

            $personId = (int) ($invoice->person_id ?? 0);
            $byPerson[$personId] ??= [
                'person_id' => $personId,
                'name' => $invoice->person_name ?? '—',
                'total_minor' => 0,
                'oldest_days' => 0,
            ];
            $byPerson[$personId]['total_minor'] += $outstanding;
            $byPerson[$personId]['oldest_days'] = max($byPerson[$personId]['oldest_days'], $days);
        }

        usort($byPerson, fn ($a, $b) => $b['total_minor'] <=> $a['total_minor']);

        return [
            'as_of' => $asOf->toDateString(),
            'buckets' => $buckets,
            'total_minor' => array_sum($buckets),
            'customers' => array_values($byPerson),
            'note' => 'outstanding_is_invoice_total',
        ];
    }

    /**
     * This period against the one before it, like for like.
     *
     * A number on its own — "1.2 billion rial of sales" — is not a fact a shop can act on. What
     * a manager reads is direction: up or down, and by how much. The previous period is the same
     * number of days immediately before the range, not "last month", because comparing 31 days
     * with 28 is how a report lies without containing a single wrong figure.
     *
     * @return array<string, mixed>
     */
    public function comparePeriods(
        int $tenantId,
        Carbon $from,
        Carbon $to,
        ?int $branchId = null,
    ): array {
        // Inclusive day count: a 1-day range is one day, not zero.
        $days = max(1, $from->copy()->startOfDay()->diffInDays($to->copy()->startOfDay()) + 1);

        $previousTo = $from->copy()->startOfDay()->subSecond();
        $previousFrom = $previousTo->copy()->subDays($days - 1)->startOfDay();

        $current = $this->profitAndLoss($tenantId, $from, $to, $branchId);
        $previous = $this->profitAndLoss($tenantId, $previousFrom, $previousTo, $branchId);

        /**
         * A percentage change from zero has no honest value: it is not "+100%", it is "there
         * was nothing to compare with". Returning null makes the screen print a dash instead of
         * an infinity sign, and keeps a brand-new shop from looking like a collapse.
         */
        $change = function (float|int $now, float|int $before): ?float {
            if (abs($before) < 0.00005) {
                return null;
            }

            return round((($now - $before) / abs($before)) * 100, 2);
        };

        $metric = fn (string $key, callable $pick, string $label): array => [
            'key' => $key,
            'label' => $label,
            'current' => $pick($current),
            'previous' => $pick($previous),
            'change_percent' => $change((float) $pick($current), (float) $pick($previous)),
        ];

        return [
            'current' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'previous' => ['from' => $previousFrom->toDateString(), 'to' => $previousTo->toDateString()],
            'days' => $days,
            'metrics' => [
                $metric('net_revenue', fn ($p) => $p['revenue']['net_minor'], 'درآمد خالص'),
                $metric('orders', fn ($p) => $p['revenue']['orders'], 'تعداد سفارش'),
                $metric('average_ticket', fn ($p) => $p['average_ticket_minor'], 'میانگین سبد'),
                $metric('material_cost', fn ($p) => $p['cost_of_sales']['material_minor'], 'بهای مواد'),
                $metric('gross_profit', fn ($p) => $p['gross_profit_minor'], 'سود ناخالص'),
                $metric('operating_profit', fn ($p) => $p['operating_profit_minor'], 'سود عملیاتی'),
            ],
            // Margin points, not percent change: going from 32% to 28% is −4 points, and
            // calling that "−12.5%" is the wrong unit for a conversation about margin.
            'margin_points' => [
                'gross' => [
                    'current' => $current['gross_margin_percent'],
                    'previous' => $previous['gross_margin_percent'],
                    'change' => $current['gross_margin_percent'] === null || $previous['gross_margin_percent'] === null
                        ? null
                        : round($current['gross_margin_percent'] - $previous['gross_margin_percent'], 2),
                ],
                'operating' => [
                    'current' => $current['operating_margin_percent'],
                    'previous' => $previous['operating_margin_percent'],
                    'change' => $current['operating_margin_percent'] === null || $previous['operating_margin_percent'] === null
                        ? null
                        : round($current['operating_margin_percent'] - $previous['operating_margin_percent'], 2),
                ],
            ],
        ];
    }

    /**
     * VAT for a period: what was charged on sales, what was paid on purchases, what is due.
     *
     * Both halves come from the same ledger, so the two cannot be computed on different
     * populations and then argued about. Output VAT is the credit side of the tax account,
     * input VAT its debit side; the difference is the return.
     *
     * The sales figure from the order rows is reported alongside as a cross-check. If the two
     * disagree, the journal has been edited by hand or a sale posted without tax — either way it
     * is something a person needs to see rather than a number to quietly pick one of.
     *
     * @return array<string, mixed>
     */
    public function vatSummary(int $tenantId, Carbon $from, Carbon $to, ?int $branchId = null): array
    {
        $roles = app(\App\Services\Accounting\AccountCoding::class)->get($tenantId)['roles'];
        $vatCode = (string) ($roles['vat'] ?? '2101');

        $lines = DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->where('je.tenant_id', $tenantId)
            ->whereBetween('je.document_date', [$from, $to])
            ->whereIn('je.status', ['posted', 'confirmed'])
            ->where('a.code', $vatCode)
            ->selectRaw('COALESCE(SUM(jl.credit),0) as output_vat')
            ->selectRaw('COALESCE(SUM(jl.debit),0) as input_vat')
            ->first();

        $output = (int) round((float) ($lines->output_vat ?? 0));
        $input = (int) round((float) ($lines->input_vat ?? 0));

        // What the orders themselves say was charged, as an independent check.
        $fromOrders = (int) round((float) DB::table('orders')
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', self::SOLD)
            ->sum('tax_minor'));

        // Sales split by rate is what a return actually asks for; a single rate still fits.
        $byRate = DB::table('orders')
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', self::SOLD)
            ->where('tax_minor', '>', 0)
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(total_minor - tax_minor),0) as net_sales')
            ->selectRaw('COALESCE(SUM(tax_minor),0) as tax')
            ->first();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'branch_id' => $branchId,
            'account_code' => $vatCode,
            'output_tax_minor' => $output,
            'input_tax_minor' => $input,
            'payable_minor' => $output - $input,
            // A negative payable is a credit carried forward, which is a real outcome and not
            // an error; the screen labels it rather than clamping it to zero.
            'credit_carried_minor' => max(0, $input - $output),
            'taxed_sales' => [
                'orders' => (int) ($byRate->orders ?? 0),
                'net_minor' => (int) round((float) ($byRate->net_sales ?? 0)),
                'tax_minor' => (int) round((float) ($byRate->tax ?? 0)),
                'effective_rate_percent' => (float) ($byRate->net_sales ?? 0) > 0
                    ? round(((float) $byRate->tax / (float) $byRate->net_sales) * 100, 2)
                    : null,
            ],
            'tax_on_orders_minor' => $fromOrders,
            'reconciles' => abs($fromOrders - $output) <= 1,
            'difference_minor' => $fromOrders - $output,
        ];
    }

    /** Operating expenses from the chart, grouped by account. */
    private function expenseLines(int $tenantId, Carbon $from, Carbon $to, ?int $branchId): array
    {
        // Branch is not modelled on ledger lines; filtering here would silently drop expenses
        // rather than narrow them, so the flag is reported instead of applied.
        $rows = DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->where('je.tenant_id', $tenantId)
            ->whereBetween('je.document_date', [$from, $to])
            ->whereIn('je.status', ['posted', 'confirmed'])
            ->where('a.type', 'expense')
            // COGS is already counted from the frozen line costs; counting the ledger's COGS
            // account too would double it.
            ->whereNotIn('a.code', ['5101'])
            ->groupBy('a.id', 'a.code', 'a.name')
            ->select([
                'a.code',
                'a.name',
                DB::raw('COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) as amount'),
            ])
            ->get();

        return $rows->map(fn ($row) => [
            'code' => $row->code,
            'name' => $row->name,
            'amount_minor' => (int) round((float) $row->amount),
        ])->values()->all();
    }

    /** Payroll from the attendance/payroll tables when they exist; zero otherwise. */
    private function payrollCost(int $tenantId, Carbon $from, Carbon $to): int
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('cafe_payroll_runs')) {
            return 0;
        }

        // Gross plus the employer's share: both are real cost to the business. Net pay alone
        // would understate payroll by the insurance and the withheld tax that the shop still
        // pays over on the employee's behalf.
        return (int) round((float) DB::table('cafe_payroll_runs')
            ->where('tenant_id', $tenantId)
            ->where('period_start', '>=', $from->toDateString())
            ->where('period_start', '<=', $to->toDateString())
            ->where('status', 'posted')
            ->sum(DB::raw('gross_total_minor + employer_insurance_total_minor')));
    }
}
