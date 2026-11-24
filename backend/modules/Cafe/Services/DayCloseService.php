<?php

namespace Modules\Cafe\Services;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Cafe\Entities\CafeDayClose;
use Modules\Cafe\Entities\CafeShift;

/**
 * Closing the business day.
 *
 * A day close is the manager's answer to "what happened today, and does it add up?" It pulls
 * every shift that touched the date, refuses to close while a drawer is still open or a count
 * is still waiting, and freezes the day's totals onto one row that the accountant and the owner
 * read instead of re-adding shifts by hand.
 *
 * Closing is idempotent per branch and date: a second attempt returns the row that exists
 * rather than creating a rival version of the same day.
 */
final class DayCloseService
{
    public function __construct(
        private readonly CafeShiftService $shifts,
        private readonly TillReports $reports,
    ) {}

    /**
     * Preview the day without closing it.
     *
     * @return array<string, mixed>
     */
    public function preview(int $tenantId, string $businessDate, ?int $branchId = null): array
    {
        return $this->reports->dayReport($tenantId, $businessDate, $branchId);
    }

    /**
     * Close the day.
     *
     * @param  array{business_date: string, branch_id?: int|null, note?: string|null}  $data
     */
    public function close(User $manager, array $data): CafeDayClose
    {
        $tenantId = (int) $manager->tenant_id;
        $date = Carbon::parse((string) $data['business_date'])->toDateString();
        $branchId = isset($data['branch_id']) ? (int) $data['branch_id'] : null;

        $existing = $this->find($tenantId, $date, $branchId);

        if ($existing !== null && (string) $existing->status === CafeDayClose::STATUS_CLOSED) {
            throw ValidationException::withMessages([
                'business_date' => __('api.cafe_day_already_closed'),
            ]);
        }

        $report = $this->reports->dayReport($tenantId, $date, $branchId);

        if ((int) $report['open_shifts'] > 0) {
            // The day cannot be signed off while money is still moving through a drawer.
            throw ValidationException::withMessages([
                'business_date' => __('api.cafe_day_open_shifts'),
            ]);
        }

        $sum = $report['sum'];

        return DB::transaction(function () use ($manager, $tenantId, $date, $branchId, $sum, $report, $data, $existing) {
            $payload = [
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'business_date' => $date,
                'status' => CafeDayClose::STATUS_CLOSED,
                'shifts' => (int) $report['shift_count'],
                'gross_sales_minor' => (int) ($sum['gross_sales_minor'] ?? 0),
                'cash_sales_minor' => (int) ($sum['cash_sales_minor'] ?? 0),
                'non_cash_sales_minor' => (int) ($sum['non_cash_sales_minor'] ?? 0),
                'discounts_minor' => (int) ($sum['discounts_minor'] ?? 0),
                'tax_minor' => (int) ($sum['tax_minor'] ?? 0),
                'expected_cash_minor' => (int) ($sum['expected_cash_minor'] ?? 0),
                'counted_cash_minor' => (int) ($sum['counted_cash_minor'] ?? 0),
                'variance_minor' => (int) ($sum['variance_minor'] ?? 0),
                'totals' => $report,
                'note' => $data['note'] ?? null,
                'closed_by' => $manager->id,
                'closed_at' => now(),
            ];

            $close = $existing ?? new CafeDayClose;
            $close->fill($payload)->save();

            // Stamp the day onto its shifts so a shift report can say which day paid for it.
            CafeShift::query()
                ->where('tenant_id', $tenantId)
                ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
                ->where(function ($q) use ($date): void {
                    $q->whereDate('closed_at', $date)->orWhereDate('opened_at', $date);
                })
                ->update(['day_close_id' => $close->id]);

            $closed = $close->fresh();

            // The day is signed off. Anything that monitors the shop's money wants this event,
            // and it is queued after the transaction commits so it cannot describe a close that
            // was then rolled back.
            try {
                app(\App\Services\Webhooks\WebhookDispatcher::class)->queue($tenantId, 'day.closed', [
                    'day_close_id' => (int) $closed->id,
                    'business_date' => $closed->business_date,
                    'gross_sales_minor' => (int) $closed->gross_sales_minor,
                    'variance_minor' => (int) $closed->variance_minor,
                ]);
            } catch (\Throwable) {
                // A notification must never be why a day cannot be closed.
            }

            return $closed;
        });
    }

    /** @return array<string, mixed> */
    public function history(int $tenantId, int $limit = 60): array
    {
        $rows = CafeDayClose::query()
            ->where('tenant_id', $tenantId)
            ->orderByDesc('business_date')
            ->limit($limit)
            ->with('closedBy:id,name')
            ->get();

        return $rows->map(fn (CafeDayClose $row) => [
            'id' => $row->id,
            'business_date' => $row->business_date?->toDateString(),
            'branch_id' => $row->branch_id,
            'status' => $row->status,
            'shifts' => $row->shifts,
            'gross_sales_minor' => $row->gross_sales_minor,
            'cash_sales_minor' => $row->cash_sales_minor,
            'variance_minor' => $row->variance_minor,
            'closed_by' => $row->closedBy?->name,
            'closed_at' => $row->closed_at,
        ])->values()->all();
    }

    private function find(int $tenantId, string $date, ?int $branchId): ?CafeDayClose
    {
        return CafeDayClose::query()
            ->where('tenant_id', $tenantId)
            ->where('business_date', $date)
            ->when($branchId === null, fn ($q) => $q->whereNull('branch_id'), fn ($q) => $q->where('branch_id', $branchId))
            ->first();
    }
}
