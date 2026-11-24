<?php

namespace Modules\Cafe\Services;

use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Cafe\Entities\CafeShift;
use Modules\Cafe\Entities\CafeShiftMovement;

/**
 * Cashier shifts and cash-drawer reconciliation.
 *
 * The question a closing shift has to answer is simple and unforgiving: "the system says
 * this much cash should be in the drawer — is that what is actually in it?" Everything here
 * exists to make that answer exact and explainable.
 *
 * Money is summed from the orders that fall inside the shift window. Nothing is double
 * entered into a parallel ledger, so the report can always be traced back to the orders that
 * produced it.
 */
final class CafeShiftService
{
    /**
     * Cash tenders are the only ones that put physical money in the drawer.
     *
     * Card, wallet and online payments settle to the bank/PSP, so they are reported but never
     * counted as expected cash — mixing them in is the classic way a drawer "comes up short".
     */
    private const CASH_TENDERS = ['cash', 'cod'];

    /** Order states that must not count toward a shift's takings. */
    private const EXCLUDED_STATUSES = [
        'pending_payment',
        'awaiting_gateway',
        'payment_failed',
        'on_hold',
        'cancelled',
        'failed',
        'refunded',
    ];

    public function openShift(User $user, array $data): CafeShift
    {
        $tenantId = (int) $user->tenant_id;

        $existing = CafeShift::query()
            ->where('tenant_id', $tenantId)
            ->where('user_id', $user->id)
            ->where('status', CafeShift::STATUS_OPEN)
            ->first();

        if ($existing) {
            throw ValidationException::withMessages([
                'shift' => __('api.cafe_shift_already_open'),
            ]);
        }

        $shift = CafeShift::query()->create([
            'tenant_id' => $tenantId,
            'branch_id' => $data['branch_id'] ?? null,
            'user_id' => $user->id,
            'status' => CafeShift::STATUS_OPEN,
            'opening_float_minor' => (int) ($data['opening_float_minor'] ?? 0),
            'opened_at' => now(),
            'totals' => $this->emptyTotals(),
        ]);

        return $this->summarize($shift);
    }

    /**
     * Find the till the cashier is currently standing at, if any.
     */
    public function currentShift(User $user): ?CafeShift
    {
        $shift = CafeShift::query()
            ->where('tenant_id', (int) $user->tenant_id)
            ->where('user_id', $user->id)
            ->where('status', CafeShift::STATUS_OPEN)
            ->latest('id')
            ->first();

        return $shift ? $this->summarize($shift) : null;
    }

    /**
     * Recompute the shift's numbers and (optionally) persist them.
     *
     * Recomputing rather than accumulating means a deleted or refunded order is reflected
     * correctly instead of leaving a stale total behind.
     */
    public function summarize(CafeShift $shift, bool $persist = false): CafeShift
    {
        $totals = $this->computeTotals($shift);
        $shift->totals = $totals;

        if (! $shift->isOpen() && $shift->expected_cash_minor !== null) {
            // A closed shift keeps the figures it was closed with; only the in-memory copy
            // carries the live view for display.
            return $shift;
        }

        $shift->expected_cash_minor = $totals['expected_cash_minor'];
        $shift->variance_minor = (int) ($shift->counted_cash_minor ?? 0) - $totals['expected_cash_minor'];

        if ($persist) {
            $shift->save();
        }

        return $shift;
    }

    /**
     * @return array<string, mixed>
     */
    public function computeTotals(CafeShift $shift): array
    {
        $tenantId = (int) $shift->tenant_id;
        $from = $shift->opened_at ? Carbon::parse($shift->opened_at) : Carbon::parse($shift->created_at);
        $to = $shift->closed_at ? Carbon::parse($shift->closed_at) : now();

        $orders = Order::query()
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$from, $to])
            ->whereNotIn('status', self::EXCLUDED_STATUSES)
            ->get(['id', 'status', 'payment_tender', 'amount_paid_minor', 'total_minor', 'discount_minor', 'shipping_minor', 'subtotal_minor', 'tax_minor', 'currency', 'number']);

        $payments = OrderPayment::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('order_id', $orders->pluck('id'))
            ->whereNull('superseded_at')
            ->get(['order_id', 'tender', 'amount_minor'])
            ->groupBy('order_id');

        $byTender = [];
        $grossMinor = 0;
        $netMinor = 0;
        $discountTotal = 0;
        $taxTotal = 0;
        $orderCount = 0;

        foreach ($orders as $order) {
            $orderCount++;
            $total = (int) ($order->total_minor ?? 0);
            $grossMinor += $total;
            $discountTotal += (int) ($order->discount_minor ?? 0);

            // Tax lives in its own column and is already inside `total_minor`; report it
            // separately for the accountant without adding it to the grand total again.
            $taxTotal += (int) ($order->tax_minor ?? 0);

            $orderPayments = $payments->get($order->id);
            $amounts = $orderPayments
                ? $orderPayments->groupBy('tender')->map(fn ($rows) => (int) $rows->sum('amount_minor'))->all()
                : [(string) ($order->payment_tender ?: 'unspecified') => $total];
            foreach ($amounts as $tender => $amount) {
                if (! isset($byTender[$tender])) {
                    $byTender[$tender] = ['tender' => $tender, 'count' => 0, 'amount_minor' => 0];
                }
                $byTender[$tender]['count']++;
                $byTender[$tender]['amount_minor'] += $amount;
            }
        }

        $netMinor = $grossMinor - $discountTotal;

        $cashSales = 0;
        foreach (self::CASH_TENDERS as $tender) {
            $cashSales += (int) ($byTender[$tender]['amount_minor'] ?? 0);
        }

        $movements = CafeShiftMovement::query()
            ->where('tenant_id', $tenantId)
            ->where('shift_id', $shift->id)
            ->get();

        $cashIn = 0;
        $cashOut = 0;
        $drops = 0;
        foreach ($movements as $movement) {
            switch ((string) $movement->type) {
                case CafeShiftMovement::TYPE_CASH_IN:
                    $cashIn += (int) $movement->amount_minor;
                    break;
                case CafeShiftMovement::TYPE_CASH_OUT:
                    $cashOut += abs((int) $movement->amount_minor);
                    break;
                case CafeShiftMovement::TYPE_DROP:
                    $drops += abs((int) $movement->amount_minor);
                    break;
            }
        }

        $openingFloat = (int) ($shift->opening_float_minor ?? 0);
        $expectedCash = $openingFloat + $cashSales + $cashIn - $cashOut - $drops;

        $counted = $shift->counted_cash_minor;
        $variance = $counted === null ? null : (int) $counted - $expectedCash;

        // Non-cash turnover is what the accountant reconciles against the bank, so surface it
        // separately instead of burying it inside the grand total.
        $nonCashSales = array_sum(array_column($byTender, 'amount_minor')) - $cashSales;

        return [
            'orders' => $orderCount,
            'gross_sales_minor' => $grossMinor,
            'net_sales_minor' => $netMinor,
            'discounts_minor' => $discountTotal,
            'tax_minor' => $taxTotal,
            'cash_sales_minor' => $cashSales,
            'non_cash_sales_minor' => $nonCashSales,
            'by_tender' => array_values($byTender),
            'opening_float_minor' => $openingFloat,
            'cash_in_minor' => $cashIn,
            'cash_out_minor' => $cashOut,
            'drops_minor' => $drops,
            'expected_cash_minor' => $expectedCash,
            'counted_cash_minor' => $counted === null ? null : (int) $counted,
            'variance_minor' => $variance,
            'currency' => $orders->first()->currency ?? null,
            'window' => [
                'from' => $from->toIso8601String(),
                'to' => $to->toIso8601String(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function emptyTotals(): array
    {
        return [
            'orders' => 0,
            'gross_sales_minor' => 0,
            'net_sales_minor' => 0,
            'discounts_minor' => 0,
            'tax_minor' => 0,
            'cash_sales_minor' => 0,
            'non_cash_sales_minor' => 0,
            'by_tender' => [],
            'opening_float_minor' => 0,
            'cash_in_minor' => 0,
            'cash_out_minor' => 0,
            'drops_minor' => 0,
            'expected_cash_minor' => 0,
            'counted_cash_minor' => null,
            'variance_minor' => null,
        ];
    }

    /**
     * Record a drawer movement. Locked to open shifts: you cannot move cash through a till
     * that has already been counted and signed off.
     */
    public function addMovement(User $user, CafeShift $shift, array $data): CafeShiftMovement
    {
        $this->assertOwnership($user, $shift);

        if (! $shift->isOpen()) {
            throw ValidationException::withMessages([
                'shift' => __('api.cafe_shift_closed_immutable'),
            ]);
        }

        return CafeShiftMovement::query()->create([
            'tenant_id' => (int) $shift->tenant_id,
            'shift_id' => $shift->id,
            'user_id' => $user->id,
            'type' => $data['type'],
            'amount_minor' => (int) ($data['amount_minor'] ?? 0),
            'reason' => $data['reason'] ?? null,
        ]);
    }

    /**
     * Close the drawer.
     *
     * The cashier submits a physical count; the expected figure is recomputed one last time
     * and both are frozen onto the row, so the variance it reports is the variance everyone
     * will see forever after.
     */
    public function closeShift(User $user, CafeShift $shift, array $data): CafeShift
    {
        $this->assertOwnership($user, $shift);

        if (! $shift->isOpen()) {
            throw ValidationException::withMessages([
                'shift' => __('api.cafe_shift_already_closed'),
            ]);
        }

        return DB::transaction(function () use ($shift, $data) {
            $shift->counted_cash_minor = (int) $data['counted_cash_minor'];

            $totals = $this->computeTotals($shift);
            $shift->expected_cash_minor = $totals['expected_cash_minor'];
            $shift->variance_minor = (int) $shift->counted_cash_minor - $totals['expected_cash_minor'];
            $totals['counted_cash_minor'] = (int) $shift->counted_cash_minor;
            $totals['variance_minor'] = $shift->variance_minor;
            $shift->totals = $totals;

            $shift->status = CafeShift::STATUS_CLOSED;
            $shift->closed_at = now();
            $shift->note = $data['note'] ?? $shift->note;
            $shift->save();

            return $shift;
        });
    }

    /**
     * A cashier may only touch their own till; managers with reports/orders access may touch
     * anyone's (the controller gates that separately).
     */
    private function assertOwnership(User $user, CafeShift $shift): void
    {
        abort_if((int) $user->tenant_id !== (int) $shift->tenant_id, 403);
        abort_if((int) $shift->user_id !== (int) $user->id && (string) $user->role !== 'admin', 403);
    }
}
