<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Reports\CafeReports;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;

/**
 * The owner's and the accountant's reports, with an export path for each.
 *
 * Every endpoint accepts `from`/`to`/`branch_id` and `format=csv`, because a report you cannot
 * hand to an accountant is half a report. Defaults are the current month: a report that
 * silently covers the last two years is a report that has never been read carefully.
 */
class CafeReportsController extends Controller
{
    public function __construct(private readonly CafeReports $reports) {}

    public function profitAndLoss(Request $request): JsonResponse|Response
    {
        [$from, $to, $branchId] = $this->range($request);

        $data = $this->reports->profitAndLoss($this->tenantId($request), $from, $to, $branchId);

        if ($this->wantsCsv($request)) {
            return $this->csv('profit-and-loss', [
                'درآمد فروش' => $data['revenue']['gross_minor'],
                'درآمد ارسال' => $data['revenue']['delivery_minor'],
                'تخفیفات' => $data['revenue']['discounts_minor'],
                'بهای مواد' => $data['cost_of_sales']['material_minor'],
                'سود ناخالص' => $data['gross_profit_minor'],
                'حقوق' => $data['payroll_minor'],
                'هزینه‌های عملیاتی' => $data['expenses_minor'],
                'سود عملیاتی' => $data['operating_profit_minor'],
            ]);
        }

        return response()->json(['data' => $data]);
    }

    /**
     * This period against the one before it.
     *
     * "1.2 billion rial" is not a fact a shop can act on; "up 9% on last week" is. The previous
     * period is the same number of days immediately before the range, so a 31-day January is not
     * compared with a 28-day February.
     */
    public function compare(Request $request): JsonResponse|Response
    {
        [$from, $to, $branchId] = $this->range($request);

        $data = $this->reports->comparePeriods($this->tenantId($request), $from, $to, $branchId);

        if ($this->wantsCsv($request)) {
            return $this->csvRows(
                'period-comparison',
                ['شاخص', 'دوره جاری', 'دوره قبل', 'تغییر (٪)'],
                array_map(
                    fn (array $row) => [
                        $row['label'],
                        $row['current'],
                        $row['previous'],
                        $row['change_percent'] ?? '—',
                    ],
                    $data['metrics'],
                ),
            );
        }

        return response()->json(['data' => $data]);
    }

    /**
     * VAT for a period: charged on sales, paid on purchases, due.
     *
     * A shop that cannot produce this number has to reconstruct it from a shoebox at filing
     * time. Both halves come from the same ledger, and the sales-side figure is reported
     * separately as a cross-check rather than being silently preferred.
     */
    public function vat(Request $request): JsonResponse|Response
    {
        [$from, $to, $branchId] = $this->range($request);

        $data = $this->reports->vatSummary($this->tenantId($request), $from, $to, $branchId);

        if ($this->wantsCsv($request)) {
            return $this->csv('vat', [
                'مالیات فروش (بستانکار)' => $data['output_tax_minor'],
                'مالیات خرید (بدهکار)' => $data['input_tax_minor'],
                'قابل پرداخت' => $data['payable_minor'],
                'اعتبار قابل انتقال' => $data['credit_carried_minor'],
                'مالیات ثبت‌شده روی سفارش‌ها' => $data['tax_on_orders_minor'],
                'اختلاف' => $data['difference_minor'],
            ]);
        }

        return response()->json(['data' => $data]);
    }

    public function menuEngineering(Request $request): JsonResponse|Response
    {
        [$from, $to, $branchId] = $this->range($request);

        $data = $this->reports->menuEngineering($this->tenantId($request), $from, $to, $branchId);

        if ($this->wantsCsv($request)) {
            return $this->csvRows('menu-engineering', ['آیتم', 'تعداد فروش', 'درآمد', 'بهای مواد', 'حاشیه هر واحد', 'دسته'], array_map(
                fn (array $row) => [$row['name'], $row['quantity'], $row['revenue_minor'], $row['cost_minor'], $row['margin_per_unit_minor'], $row['class']],
                $data['items'],
            ));
        }

        return response()->json(['data' => $data]);
    }

    /**
     * What the menu costs to make today, against what it cost when it sold.
     *
     * Historical margins are frozen at the moment of sale and stay true; this is the other
     * half of the question — would the dish still earn that if we cooked it now.
     */
    /**
     * What the shop owes suppliers, aged by due date.
     *
     * The mirror of the receivable report: a shop that knows what it is owed but not what it
     * owes has half a cash position, and it is missing the half with due dates.
     */
    public function payableAging(Request $request): JsonResponse|Response
    {
        $asOf = $request->query('as_of') !== null
            ? Carbon::parse((string) $request->query('as_of'))
            : now();
        $data = $this->reports->payableAging($this->tenantId($request), $asOf);

        if ($this->wantsCsv($request)) {
            return $this->csvRows('payable-aging', [
                'تأمین‌کننده', 'مانده', 'دیرکرد', 'قدیمی‌ترین روز', 'فاکتورها',
            ], array_map(
                fn (array $row) => [
                    $row['name'],
                    $row['total_minor'],
                    $row['overdue_minor'],
                    $row['oldest_days'],
                    count($row['bills']),
                ],
                $data['suppliers'],
            ));
        }

        return response()->json(['data' => $data]);
    }

    public function replacementCost(Request $request): JsonResponse|Response
    {
        [$from, $to, $branchId] = $this->range($request);

        $data = $this->reports->replacementCost(
            $this->tenantId($request),
            $from,
            $to,
            $branchId,
            (int) $request->query('limit', 50),
        );

        if ($this->wantsCsv($request)) {
            return $this->csvRows('replacement-cost', [
                'آیتم', 'تعداد فروش', 'بهای هر واحد در زمان فروش', 'بهای جایگزینی امروز', 'اختلاف', 'اختلاف درصد', 'حاشیه امروز ٪',
            ], array_map(
                fn (array $row) => [
                    $row['name'],
                    $row['quantity'],
                    $row['historical_unit_cost_minor'],
                    $row['replacement_unit_cost_minor'] ?? '—',
                    $row['delta_minor'] ?? '—',
                    $row['delta_percent'] ?? '—',
                    $row['replacement_margin_percent'] ?? '—',
                ],
                $data['items'],
            ));
        }

        return response()->json(['data' => $data]);
    }

    public function control(Request $request): JsonResponse|Response
    {
        [$from, $to, $branchId] = $this->range($request);

        $data = $this->reports->control($this->tenantId($request), $from, $to, $branchId);

        if ($this->wantsCsv($request)) {
            return $this->csvRows('control', ['کاربر', 'سفارش‌ها', 'فروش', 'تخفیف', 'سفارش تخفیف‌دار', 'ابطال', 'استرداد', 'کسری صندوق', 'اضافه صندوق'], array_map(
                fn (array $row) => [
                    $row['name'], $row['orders'], $row['sales_minor'], $row['discounts_minor'],
                    $row['discounted_orders'], $row['cancelled_orders'], $row['refunds_minor'],
                    $row['short_minor'], $row['over_minor'],
                ],
                $data['staff'],
            ));
        }

        return response()->json(['data' => $data]);
    }

    public function aging(Request $request): JsonResponse|Response
    {
        $asOf = $request->filled('as_of') ? Carbon::parse((string) $request->input('as_of')) : now();

        $data = $this->reports->receivableAging($this->tenantId($request), $asOf);

        if ($this->wantsCsv($request)) {
            return $this->csvRows('ar-aging', ['مشتری', 'مانده', 'قدیمی‌ترین روز'], array_map(
                fn (array $row) => [$row['name'], $row['total_minor'], $row['oldest_days']],
                $data['customers'],
            ));
        }

        return response()->json(['data' => $data]);
    }

    /**
     * Service KPIs: speed, dwell, turnover, occupancy and the break-even point.
     *
     * Exported as a flat sheet rather than nested JSON, because the point of the export is to
     * be pasted into a board pack, and a board pack has one column per number.
     */
    public function service(Request $request): JsonResponse|Response
    {
        [$from, $to, $branchId] = $this->range($request);

        $data = $this->reports->serviceKpis($this->tenantId($request), $from, $to, $branchId);

        if ($this->wantsCsv($request)) {
            return $this->csv('service-kpis', [
                'سفارش‌ها' => $data['orders'],
                'فروش' => $data['revenue_minor'],
                'میانگین سبد' => $data['average_ticket_minor'],
                'زمان سفارش تا آماده‌شدن (دقیقه)' => $data['service']['order_to_serve_minutes'] ?? '',
                'مدت نشستن روی میز (دقیقه)' => $data['tables']['table_dwell_minutes'] ?? '',
                'گردش میز' => $data['tables']['table_turnover'] ?? '',
                'ضریب اشغال (٪)' => $data['tables']['occupancy_percent'] ?? '',
                'نقطه سر‌به‌سر' => $data['break_even']['revenue_minor'] ?? '',
                'هزینه ثابت' => $data['break_even']['fixed_cost_minor'],
                'حاشیه مشارکت (٪)' => $data['break_even']['contribution_percent'] ?? '',
            ]);
        }

        return response()->json(['data' => $data]);
    }

    /** @return array{0: Carbon, 1: Carbon, 2: ?int} */
    private function range(Request $request): array
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'branch_id' => ['nullable', 'integer'],
        ]);

        $from = $request->filled('from')
            ? Carbon::parse((string) $request->input('from'))->startOfDay()
            : now()->startOfMonth();

        $to = $request->filled('to')
            ? Carbon::parse((string) $request->input('to'))->endOfDay()
            : now()->endOfDay();

        $branchId = $request->filled('branch_id') ? (int) $request->input('branch_id') : null;

        return [$from, $to, $branchId];
    }

    private function tenantId(Request $request): int
    {
        return (int) $request->user()->tenant_id;
    }

    private function wantsCsv(Request $request): bool
    {
        return strtolower((string) $request->input('format', '')) === 'csv';
    }

    /** @param  array<string, int>  $rows */
    private function csv(string $name, array $rows): Response
    {
        return $this->csvRows($name, ['عنوان', 'مبلغ'], array_map(null, array_keys($rows), array_values($rows)));
    }

    /**
     * @param  list<string>  $headers
     * @param  list<list<mixed>>  $rows
     */
    private function csvRows(string $name, array $headers, array $rows): Response
    {
        $lines = [implode(',', array_map([$this, 'quote'], $headers))];

        foreach ($rows as $row) {
            $lines[] = implode(',', array_map(fn ($cell) => $this->quote((string) $cell), $row));
        }

        // BOM so Excel opens Persian in UTF-8 instead of mojibake — the single most reported
        // "the export is broken" complaint in this part of the world.
        $body = "\xEF\xBB\xBF".implode("\r\n", $lines);

        return response($body, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$name.'-'.now()->toDateString().'.csv"',
        ]);
    }

    private function quote(string $value): string
    {
        if (strpbrk($value, ",\"\r\n") === false) {
            return $value;
        }

        return '"'.str_replace('"', '""', $value).'"';
    }
}
