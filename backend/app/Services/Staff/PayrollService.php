<?php

namespace App\Services\Staff;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Monthly payroll: gross → insurance → tax → net, then a balanced journal.
 *
 * Three decisions worth stating, because they are the ones that get argued about:
 *
 *  1. **Attendance, not the rota.** Hours come from clock-in/clock-out. A published schedule is
 *     a plan; paying a plan means paying for shifts nobody worked.
 *
 *  2. **Progressive monthly tax, not a flat rate.** Iranian payroll tax is bracketed and
 *     exempt up to a yearly threshold. A flat percentage is wrong for everyone and visibly
 *     wrong for the lowest paid, which is the group it matters most for.
 *
 *  3. **The run is frozen at posting.** Lines store the rates actually applied, so changing a
 *     contract next month cannot rewrite a payslip that has been paid and filed.
 */
final class PayrollService
{
    /** Iranian monthly tax brackets, as (up to, rate) in the period's own money. */
    private const TAX_BRACKETS = [
        ['up_to' => 25_000_000, 'rate' => 0.00],
        ['up_to' => 50_000_000, 'rate' => 0.10],
        ['up_to' => 100_000_000, 'rate' => 0.15],
        ['up_to' => 200_000_000, 'rate' => 0.20],
        ['up_to' => null, 'rate' => 0.30],
    ];

    /**
     * Create (or rebuild) a draft payroll run for a period.
     *
     * @param  array{period_start: string, period_end: string, notes?: string|null}  $data
     * @return array<string, mixed>
     */
    public function buildRun(User $actor, array $data): array
    {
        $tenantId = (int) $actor->tenant_id;
        $start = Carbon::parse((string) $data['period_start'])->startOfDay();
        $end = Carbon::parse((string) $data['period_end'])->endOfDay();

        if ($end->lt($start)) {
            throw ValidationException::withMessages(['period_end' => __('api.staff_payroll_period_invalid')]);
        }

        $existing = DB::table('cafe_payroll_runs')
            ->where('tenant_id', $tenantId)
            ->where('period_start', $start->toDateString())
            ->where('period_end', $end->toDateString())
            ->first();

        if ($existing !== null && (string) $existing->status === 'posted') {
            // A posted run is a filed document. Re-running it would silently change a payslip
            // somebody has already been paid against.
            throw ValidationException::withMessages(['period_start' => __('api.staff_payroll_already_posted')]);
        }

        $contracts = DB::table('staff_contracts')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get();

        if ($contracts->isEmpty()) {
            throw ValidationException::withMessages(['period_start' => __('api.staff_payroll_no_contracts')]);
        }

        return DB::transaction(function () use ($tenantId, $start, $end, $contracts, $existing, $actor): array {
            $runId = $existing?->id ?? (int) DB::table('cafe_payroll_runs')->insertGetId([
                'tenant_id' => $tenantId,
                'period_start' => $start->toDateString(),
                'period_end' => $end->toDateString(),
                'status' => 'draft',
                'created_by' => $actor->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if ($existing !== null) {
                DB::table('cafe_payroll_lines')->where('run_id', $runId)->delete();
            }

            $totals = [
                'gross_total_minor' => 0,
                'employee_insurance_total_minor' => 0,
                'employer_insurance_total_minor' => 0,
                'tax_total_minor' => 0,
                'net_total_minor' => 0,
            ];

            foreach ($contracts as $contract) {
                $line = $this->computeLine($tenantId, (int) $contract->user_id, $contract, $start, $end);
                if ($line === null) {
                    continue;
                }

                DB::table('cafe_payroll_lines')->insert(array_merge($line, [
                    'tenant_id' => $tenantId,
                    'run_id' => $runId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]));

                foreach (['gross_minor', 'employee_insurance_minor', 'employer_insurance_minor', 'tax_minor', 'net_minor'] as $key) {
                    $totals[$key.'_total_minor'] = ($totals[$key.'_total_minor'] ?? 0) + $line[$key];
                }
            }

            DB::table('cafe_payroll_runs')->where('id', $runId)->update(array_merge($totals, [
                'settings' => json_encode(['tax_brackets' => self::TAX_BRACKETS], JSON_UNESCAPED_UNICODE),
                'updated_at' => now(),
            ]));

            return $this->presentRun($tenantId, $runId);
        });
    }

    /**
     * One person's payslip for the period.
     *
     * @return array<string, mixed>|null
     */
    private function computeLine(int $tenantId, int $userId, object $contract, Carbon $start, Carbon $end): ?array
    {
        $user = User::query()->where('tenant_id', $tenantId)->find($userId);
        if ($user === null) {
            return null;
        }

        $attendance = DB::table('staff_attendance')
            ->where('tenant_id', $tenantId)
            ->where('user_id', $userId)
            ->whereBetween('work_date', [$start->toDateString(), $end->toDateString()])
            ->selectRaw('COALESCE(SUM(hours),0) as hours')
            ->selectRaw('COALESCE(SUM(overtime_hours),0) as overtime')
            ->first();

        $hours = (float) ($attendance->hours ?? 0);
        $overtimeHours = (float) ($attendance->overtime ?? 0);

        // Unpaid leave, in days, deducted at the daily rate.
        $unpaidDays = (float) DB::table('staff_leave_requests')
            ->where('tenant_id', $tenantId)
            ->where('user_id', $userId)
            ->where('type', 'unpaid')
            ->where('status', 'approved')
            ->whereBetween('starts_on', [$start->toDateString(), $end->toDateString()])
            ->selectRaw('COALESCE(SUM(DATEDIFF(ends_on, starts_on) + 1),0) as days')
            ->value('days');

        $payType = (string) $contract->pay_type;
        $baseRate = (int) $contract->base_rate_minor;
        $weeklyHours = max(1.0, (float) $contract->weekly_hours);
        $overtimeMultiplier = max(1.0, (float) $contract->overtime_multiplier);

        // An hourly rate for overtime, whatever the contract type: a monthly salary spread over
        // the contracted weekly hours is the only defensible conversion.
        $hourlyRate = match ($payType) {
            'hourly' => (float) $baseRate,
            'daily' => (float) $baseRate / 8,
            default => (float) $baseRate / (($weeklyHours * 52) / 12),
        };

        $base = match ($payType) {
            'hourly' => (int) round($hourlyRate * $hours),
            'daily' => (int) round(($baseRate / 8) * $hours),
            default => $baseRate,
        };

        // Deducting unpaid leave only makes sense when it is not already excluded by hourly pay.
        if ($payType !== 'hourly' && $unpaidDays > 0 && $hours > 0) {
            $dailyEquivalent = $payType === 'daily' ? (int) $baseRate : (int) round($hourlyRate * 8);
            $base = max(0, $base - (int) round($dailyEquivalent * $unpaidDays));
        }

        $overtime = (int) round($hourlyRate * $overtimeHours * $overtimeMultiplier);
        $gross = $base + $overtime;

        $employeeInsurancePercent = (float) $contract->employee_insurance_percent;
        $employerInsurancePercent = (float) $contract->employer_insurance_percent;

        $employeeInsurance = (int) round($gross * ($employeeInsurancePercent / 100));
        $employerInsurance = (int) round($gross * ($employerInsurancePercent / 100));

        // Tax is on gross minus the employee's own insurance, which is how it is assessed.
        $taxable = max(0, $gross - $employeeInsurance);
        $tax = $this->progressiveTax($taxable);

        $net = max(0, $gross - $employeeInsurance - $tax);

        return [
            'user_id' => $userId,
            'pay_type' => $payType,
            'hours' => round($hours, 2),
            'overtime_hours' => round($overtimeHours, 2),
            'unpaid_leave_days' => round($unpaidDays, 2),
            'base_minor' => $base,
            'overtime_minor' => $overtime,
            'gross_minor' => $gross,
            'employee_insurance_percent' => $employeeInsurancePercent,
            'employee_insurance_minor' => $employeeInsurance,
            'employer_insurance_percent' => $employerInsurancePercent,
            'employer_insurance_minor' => $employerInsurance,
            'tax_minor' => $tax,
            'net_minor' => $net,
            'breakdown' => json_encode([
                'staff_name' => $user->name,
                'hourly_rate_minor' => round($hourlyRate, 2),
                'taxable_minor' => $taxable,
            ], JSON_UNESCAPED_UNICODE),
        ];
    }

    /**
     * Progressive tax over the brackets.
     *
     * Applied bracket by bracket, so the last band only taxes the money inside it. A flat rate
     * taken from the top band would be wrong for every employee not in it.
     */
    public function progressiveTax(int $taxableMinor): int
    {
        $remaining = $taxableMinor;
        $previousCeiling = 0;
        $tax = 0.0;

        foreach (self::TAX_BRACKETS as $bracket) {
            $ceiling = $bracket['up_to'];
            $band = $ceiling === null ? $remaining : min($remaining, $ceiling - $previousCeiling);

            if ($band <= 0) {
                break;
            }

            $tax += $band * $bracket['rate'];
            $remaining -= $band;
            $previousCeiling = $ceiling ?? $previousCeiling;

            if ($remaining <= 0) {
                break;
            }
        }

        return (int) round($tax);
    }

    /**
     * Post the run to the ledger: wages, insurance and tax each get their own account.
     *
     * The entry is what turns "we paid 400 million" into an expense an accountant can file:
     *
     *   Dr  payroll expense          gross + employer insurance
     *     Cr  salaries payable          net
     *     Cr  insurance payable         employee + employer share
     *     Cr  tax payable               withheld
     */
    public function postRun(User $actor, int $runId): array
    {
        $tenantId = (int) $actor->tenant_id;

        $run = DB::table('cafe_payroll_runs')->where('tenant_id', $tenantId)->where('id', $runId)->first();
        if ($run === null) {
            throw ValidationException::withMessages(['run' => __('api.staff_payroll_not_found')]);
        }

        if ((string) $run->status === 'posted') {
            throw ValidationException::withMessages(['run' => __('api.staff_payroll_already_posted')]);
        }

        $gross = (int) $run->gross_total_minor;
        $employeeInsurance = (int) $run->employee_insurance_total_minor;
        $employerInsurance = (int) $run->employer_insurance_total_minor;
        $tax = (int) $run->tax_total_minor;
        $net = (int) $run->net_total_minor;

        if ($gross <= 0) {
            throw ValidationException::withMessages(['run' => __('api.staff_payroll_empty')]);
        }

        // Codes come from the tenant's account coding, never from here: an accountant who
        // numbers wages differently must not have payroll posting to a stranger's chart.
        $roles = app(\App\Services\Accounting\AccountCoding::class)->get($tenantId)['roles'];

        $entry = app(\Modules\Accounting\Services\LedgerPosting::class)->post([
            ['code' => (string) $roles[\App\Models\AccAccountCoding::ROLE_WAGE_EXPENSE], 'debit' => $gross + $employerInsurance, 'description' => 'هزینه حقوق و دستمزد'],
            ['code' => (string) $roles[\App\Models\AccAccountCoding::ROLE_SALARIES_PAYABLE], 'credit' => $net, 'description' => 'حقوق پرداختنی'],
            ['code' => (string) $roles[\App\Models\AccAccountCoding::ROLE_INSURANCE_PAYABLE], 'credit' => $employeeInsurance + $employerInsurance, 'description' => 'بیمه پرداختنی'],
            ['code' => (string) $roles[\App\Models\AccAccountCoding::ROLE_PAYROLL_TAX_PAYABLE], 'credit' => $tax, 'description' => 'مالیات حقوق پرداختنی'],
        ], [
            'document_no' => 'PAY-'.$run->id,
            'document_date' => $run->period_end,
            'description' => 'لیست حقوق '.$run->period_start.' تا '.$run->period_end,
            'created_by' => $actor->id,
        ]);

        // A posted payroll run is news an accountant's system wants: it is the largest single
        // expense of most months and it happens once.
        try {
            app(\App\Services\Webhooks\WebhookDispatcher::class)->queue($tenantId, 'payroll.posted', [
                'run_id' => (int) $run->id,
                'period_start' => $run->period_start,
                'period_end' => $run->period_end,
                'gross_total_minor' => $gross,
                'net_total_minor' => $net,
                'tax_total_minor' => $tax,
                'journal_entry_id' => $entry->id,
            ]);
        } catch (\Throwable) {
            // A notification must never be why a payroll run fails to post.
        }

        DB::table('cafe_payroll_runs')->where('id', $run->id)->update([
            'status' => 'posted',
            'journal_entry_id' => $entry->id,
            'posted_by' => $actor->id,
            'posted_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->presentRun($tenantId, $runId);
    }

    /** @return array<string, mixed> */
    public function presentRun(int $tenantId, int $runId): array
    {
        $run = DB::table('cafe_payroll_runs')->where('tenant_id', $tenantId)->where('id', $runId)->first();

        if ($run === null) {
            throw ValidationException::withMessages(['run' => __('api.staff_payroll_not_found')]);
        }

        $lines = DB::table('cafe_payroll_lines as l')
            ->leftJoin('users as u', 'l.user_id', '=', 'u.id')
            ->where('l.run_id', $runId)
            ->select(['l.*', 'u.name as staff_name'])
            ->orderByDesc('l.net_minor')
            ->get()
            ->map(function ($line): array {
                $breakdown = json_decode((string) ($line->breakdown ?? '{}'), true);

                return [
                    'user_id' => (int) $line->user_id,
                    'name' => $line->staff_name ?? $breakdown['staff_name'] ?? ('#'.$line->user_id),
                    'pay_type' => $line->pay_type,
                    'hours' => (float) $line->hours,
                    'overtime_hours' => (float) $line->overtime_hours,
                    'unpaid_leave_days' => (float) $line->unpaid_leave_days,
                    'base_minor' => (int) $line->base_minor,
                    'overtime_minor' => (int) $line->overtime_minor,
                    'gross_minor' => (int) $line->gross_minor,
                    'employee_insurance_minor' => (int) $line->employee_insurance_minor,
                    'employer_insurance_minor' => (int) $line->employer_insurance_minor,
                    'tax_minor' => (int) $line->tax_minor,
                    'net_minor' => (int) $line->net_minor,
                ];
            })
            ->values()
            ->all();

        return [
            'id' => (int) $run->id,
            'period_start' => $run->period_start,
            'period_end' => $run->period_end,
            'status' => $run->status,
            'gross_total_minor' => (int) $run->gross_total_minor,
            'employee_insurance_total_minor' => (int) $run->employee_insurance_total_minor,
            'employer_insurance_total_minor' => (int) $run->employer_insurance_total_minor,
            'tax_total_minor' => (int) $run->tax_total_minor,
            'net_total_minor' => (int) $run->net_total_minor,
            'journal_entry_id' => $run->journal_entry_id === null ? null : (int) $run->journal_entry_id,
            'posted_at' => $run->posted_at,
            'lines' => $lines,
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public function listRuns(int $tenantId, int $limit = 24): array
    {
        return DB::table('cafe_payroll_runs')
            ->where('tenant_id', $tenantId)
            ->orderByDesc('period_start')
            ->limit($limit)
            ->get()
            ->map(fn ($run) => [
                'id' => (int) $run->id,
                'period_start' => $run->period_start,
                'period_end' => $run->period_end,
                'status' => $run->status,
                'gross_total_minor' => (int) $run->gross_total_minor,
                'net_total_minor' => (int) $run->net_total_minor,
                'journal_entry_id' => $run->journal_entry_id === null ? null : (int) $run->journal_entry_id,
                'posted_at' => $run->posted_at,
            ])
            ->values()
            ->all();
    }
}
