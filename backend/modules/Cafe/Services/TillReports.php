<?php

namespace Modules\Cafe\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Cafe\Entities\CafeShift;
use Modules\Cafe\Entities\CafeShiftMovement;

/**
 * X and Z reports — the two documents a till prints about itself.
 *
 * The distinction is not cosmetic and cashiers are trained on it:
 *
 *   **X** is a snapshot. "Right now, this drawer holds this much, broken down like this." You
 *   may pull an X as many times as you like; it changes nothing and closes nothing.
 *
 *   **Z** is the closing document. It ends the shift, freezes the numbers forever, and is what
 *   the manager signs. There is exactly one per shift, and printing it again reproduces the
 *   frozen figures rather than recomputing them — otherwise a late refund would rewrite a
 *   report the accountant has already filed.
 *
 * Both are built from the same shape so an accountant can diff them line by line.
 */
final class TillReports
{
    public function __construct(private readonly CafeShiftService $shifts) {}

    /**
     * X report: live figures for an open shift.
     *
     * @return array<string, mixed>
     */
    public function xReport(CafeShift $shift): array
    {
        $totals = $this->shifts->computeTotals($shift);

        return $this->shape($shift, $totals, 'X');
    }

    /**
     * Z report: the frozen closing document.
     *
     * For a shift that is already closed this returns what was frozen at close, so reprinting
     * is repeatable. For an open shift it returns the same numbers the close would commit,
     * which is what a "preview Z" is for.
     *
     * @return array<string, mixed>
     */
    public function zReport(CafeShift $shift): array
    {
        $frozen = ! $shift->isOpen() && is_array($shift->totals) && $shift->totals !== [];

        $totals = $frozen ? $shift->totals : $this->shifts->computeTotals($shift);

        // A closed shift's count and variance are its frozen ones, not a fresh calculation.
        if ($frozen) {
            $totals['counted_cash_minor'] = $shift->counted_cash_minor;
            $totals['variance_minor'] = $shift->variance_minor;
        }

        return $this->shape($shift, $totals, 'Z');
    }

    /**
     * The day's Z: every shift that closed inside a business date, added up.
     *
     * @return array<string, mixed>
     */
    public function dayReport(int $tenantId, string $businessDate, ?int $branchId = null): array
    {
        $from = Carbon::parse($businessDate)->startOfDay();
        $to = $from->copy()->endOfDay();

        $shifts = CafeShift::query()
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->where(function ($q) use ($from, $to): void {
                // A shift belongs to the day it closed; an open one belongs to today.
                $q->whereBetween('closed_at', [$from, $to])
                    ->orWhere(function ($w) use ($from, $to): void {
                        $w->whereNull('closed_at')->whereBetween('opened_at', [$from, $to]);
                    });
            })
            ->orderBy('opened_at')
            ->get();

        $sum = [
            'orders' => 0,
            'gross_sales_minor' => 0,
            'net_sales_minor' => 0,
            'discounts_minor' => 0,
            'tax_minor' => 0,
            'shipping_minor' => 0,
            'cash_sales_minor' => 0,
            'non_cash_sales_minor' => 0,
            'cash_in_minor' => 0,
            'cash_out_minor' => 0,
            'drops_minor' => 0,
            'expected_cash_minor' => 0,
            'counted_cash_minor' => 0,
            'variance_minor' => 0,
        ];

        $tenders = [];
        $rows = [];

        foreach ($shifts as $shift) {
            $totals = is_array($shift->totals) && $shift->totals !== []
                ? $shift->totals
                : $this->shifts->computeTotals($shift);

            foreach ($sum as $key => $_) {
                $sum[$key] += (int) ($totals[$key] ?? 0);
            }
            $sum['variances'] = ($sum['variances'] ?? 0) + ((int) ($totals['variance_minor'] ?? 0) !== 0 ? 1 : 0);

            foreach ((array) ($totals['by_tender'] ?? []) as $row) {
                $tender = (string) ($row['tender'] ?? '');
                $tenders[$tender] ??= ['tender' => $tender, 'count' => 0, 'amount_minor' => 0];
                $tenders[$tender]['count'] += (int) ($row['count'] ?? 0);
                $tenders[$tender]['amount_minor'] += (int) ($row['amount_minor'] ?? 0);
            }

            $rows[] = [
                'shift_id' => $shift->id,
                'cashier' => $shift->user?->name,
                'status' => $shift->status,
                'opened_at' => $shift->opened_at,
                'closed_at' => $shift->closed_at,
                'orders' => (int) ($totals['orders'] ?? 0),
                'gross_sales_minor' => (int) ($totals['gross_sales_minor'] ?? 0),
                'cash_sales_minor' => (int) ($totals['cash_sales_minor'] ?? 0),
                'expected_cash_minor' => (int) ($totals['expected_cash_minor'] ?? 0),
                'counted_cash_minor' => $shift->counted_cash_minor,
                'variance_minor' => (int) ($totals['variance_minor'] ?? 0),
            ];
        }

        // A day in which every drawer balanced is the exception, so lead with the exceptions.
        usort($tenders, fn ($a, $b) => $b['amount_minor'] <=> $a['amount_minor']);

        return [
            'business_date' => $businessDate,
            'branch_id' => $branchId,
            'shift_count' => $shifts->count(),
            'sum' => $sum,
            'by_tender' => $tenders,
            'shifts' => $rows,
            'open_shifts' => $shifts->filter(fn (CafeShift $s) => $s->isOpen())->count(),
        ];
    }

    /**
     * @param  array<string, mixed>  $totals
     * @return array<string, mixed>
     */
    private function shape(CafeShift $shift, array $totals, string $kind): array
    {
        $movements = CafeShiftMovement::query()
            ->where('tenant_id', (int) $shift->tenant_id)
            ->where('shift_id', $shift->id)
            ->orderBy('id')
            ->get(['id', 'type', 'amount_minor', 'reason', 'created_at']);

        $counted = $shift->counted_cash_minor;
        $expected = (int) ($totals['expected_cash_minor'] ?? 0);

        return [
            'kind' => $kind,
            'shift_id' => $shift->id,
            'branch_id' => $shift->branch_id,
            'cashier' => $shift->user?->name,
            'status' => $shift->status,
            'count_status' => $shift->count_status,
            'opened_at' => $shift->opened_at,
            'closed_at' => $shift->closed_at,
            'generated_at' => now()->toIso8601String(),
            'currency' => $totals['currency'] ?? null,
            'window' => $totals['window'] ?? null,
            'sales' => [
                'orders' => (int) ($totals['orders'] ?? 0),
                'gross_minor' => (int) ($totals['gross_sales_minor'] ?? 0),
                'net_minor' => (int) ($totals['net_sales_minor'] ?? 0),
                'discounts_minor' => (int) ($totals['discounts_minor'] ?? 0),
                'tax_minor' => (int) ($totals['tax_minor'] ?? 0),
                'shipping_minor' => (int) ($totals['shipping_minor'] ?? 0),
            ],
            'tenders' => array_values((array) ($totals['by_tender'] ?? [])),
            'drawer' => [
                'opening_float_minor' => (int) ($totals['opening_float_minor'] ?? 0),
                'cash_sales_minor' => (int) ($totals['cash_sales_minor'] ?? 0),
                'cash_in_minor' => (int) ($totals['cash_in_minor'] ?? 0),
                'cash_out_minor' => (int) ($totals['cash_out_minor'] ?? 0),
                'drops_minor' => (int) ($totals['drops_minor'] ?? 0),
                'expected_minor' => $expected,
                'counted_minor' => $counted === null ? null : (int) $counted,
                'variance_minor' => $counted === null ? null : (int) $counted - $expected,
                'over_short' => $counted === null ? null : (((int) $counted - $expected) >= 0 ? 'over' : 'short'),
            ],
            'movements' => $movements,
            'signoff' => [
                'counted_by' => $shift->counted_by,
                'counted_at' => $shift->counted_at,
                'approved_by' => $shift->approved_by,
                'approved_at' => $shift->approved_at,
                'journal_entry_id' => $shift->journal_entry_id,
            ],
        ];
    }

    /**
     * Tender totals for a free date range — the number behind a daily sales report.
     *
     * Separate from the shift reports on purpose: reports must cover a week or a month, and a
     * shift report is inherently one drawer. Kept here so both use the same tender names.
     *
     * @return array<string, mixed>
     */
    public function tenderTotals(int $tenantId, Carbon $from, Carbon $to, ?int $branchId = null): array
    {
        $rows = DB::table('orders')
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to])
            ->whereNotIn('status', [
                'pending_payment', 'awaiting_gateway', 'payment_failed', 'on_hold',
                'cancelled', 'failed', 'refunded',
            ])
            ->select([
                'payment_tender',
                DB::raw('COUNT(*) as orders'),
                DB::raw('SUM(total_minor) as gross_minor'),
            ])
            ->groupBy('payment_tender')
            ->get();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'branch_id' => $branchId,
            'rows' => $rows,
        ];
    }
}
