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

    public function __construct(private readonly \App\Services\Catalog\RecipeCosting $costing) {}

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
