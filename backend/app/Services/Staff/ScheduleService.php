<?php

namespace App\Services\Staff;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The rota: who works when, who actually showed up, and who is on leave.
 *
 * Publishing a week is one act — a manager builds the plan, then publishes it, and only then
 * does it become something staff can see and rely on. Leaving every saved row "live" is how a
 * half-built rota ends up being worked.
 */
final class ScheduleService
{
    /**
     * The week's rota, grouped by day.
     *
     * @return array<string, mixed>
     */
    public function week(int $tenantId, string $weekStart, ?int $branchId = null): array
    {
        $start = Carbon::parse($weekStart)->startOfWeek(Carbon::SATURDAY);
        $end = $start->copy()->addDays(6);

        $shifts = DB::table('staff_shifts as s')
            ->leftJoin('users as u', 's.user_id', '=', 'u.id')
            ->where('s.tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('s.branch_id', $branchId))
            ->whereBetween('s.work_date', [$start->toDateString(), $end->toDateString()])
            ->select(['s.*', 'u.name as staff_name'])
            ->orderBy('s.work_date')
            ->orderBy('s.starts_at')
            ->get();

        // Leave that overlaps the week, so a manager sees it while building the rota rather
        // than discovering it when someone does not turn up.
        $leave = DB::table('staff_leave_requests as l')
            ->leftJoin('users as u', 'l.user_id', '=', 'u.id')
            ->where('l.tenant_id', $tenantId)
            ->where('l.status', 'approved')
            ->where('l.starts_on', '<=', $end->toDateString())
            ->where('l.ends_on', '>=', $start->toDateString())
            ->select(['l.*', 'u.name as staff_name'])
            ->get();

        $days = [];
        for ($i = 0; $i < 7; $i++) {
            $date = $start->copy()->addDays($i)->toDateString();
            $days[] = [
                'date' => $date,
                'shifts' => $shifts->where('work_date', $date)->map(fn ($shift) => $this->presentShift($shift))->values()->all(),
            ];
        }

        return [
            'week_start' => $start->toDateString(),
            'week_end' => $end->toDateString(),
            'branch_id' => $branchId,
            'days' => $days,
            'leave' => $leave->map(fn ($row) => [
                'id' => (int) $row->id,
                'user_id' => (int) $row->user_id,
                'name' => $row->staff_name,
                'type' => $row->type,
                'starts_on' => $row->starts_on,
                'ends_on' => $row->ends_on,
            ])->values()->all(),
            'total_hours' => round($shifts->sum(fn ($shift) => $this->hoursBetween((string) $shift->starts_at, (string) $shift->ends_at)), 2),
        ];
    }

    /**
     * Save a set of shifts for the week (idempotent per user/date/start).
     *
     * @param  list<array<string, mixed>>  $shifts
     */
    public function saveShifts(User $actor, array $shifts, ?int $branchId = null): array
    {
        $tenantId = (int) $actor->tenant_id;
        $saved = [];

        DB::transaction(function () use ($tenantId, $shifts, $actor, $branchId, &$saved): void {
            foreach ($shifts as $shift) {
                $hours = $this->hoursBetween((string) $shift['starts_at'], (string) $shift['ends_at']);

                $id = DB::table('staff_shifts')->updateOrInsert(
                    [
                        'tenant_id' => $tenantId,
                        'user_id' => (int) $shift['user_id'],
                        'work_date' => $shift['work_date'],
                        'starts_at' => $shift['starts_at'],
                    ],
                    [
                        'branch_id' => $branchId,
                        'ends_at' => $shift['ends_at'],
                        'role' => $shift['role'] ?? null,
                        'status' => $shift['status'] ?? 'planned',
                        'note' => $shift['note'] ?? null,
                        'created_by' => $actor->id,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ],
                );

                $saved[] = ['id' => $id, 'hours' => $hours];
            }
        });

        return ['saved' => count($saved), 'shifts' => $saved];
    }

    /** Publish a week: planned rows become what staff are expected to work. */
    public function publishWeek(int $tenantId, string $weekStart, ?int $branchId = null): int
    {
        $start = Carbon::parse($weekStart)->startOfWeek(Carbon::SATURDAY);
        $end = $start->copy()->addDays(6);

        return DB::table('staff_shifts')
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('work_date', [$start->toDateString(), $end->toDateString()])
            ->where('status', 'planned')
            ->update(['status' => 'published', 'updated_at' => now()]);
    }

    public function deleteShift(int $tenantId, int $shiftId): bool
    {
        return DB::table('staff_shifts')->where('tenant_id', $tenantId)->where('id', $shiftId)->delete() > 0;
    }

    /**
     * Clock in or out for a person.
     *
     * A clock-out computes and stores the hours on write: a shift that crosses midnight would
     * otherwise be recomputed differently by every reader, and the rounding rule could change
     * under a payslip that has already been paid.
     */
    public function clock(User $staff, string $direction, ?int $shiftId = null, ?string $note = null): array
    {
        $tenantId = (int) $staff->tenant_id;
        $today = now()->toDateString();

        $attendance = DB::table('staff_attendance')
            ->where('tenant_id', $tenantId)
            ->where('user_id', $staff->id)
            ->where('work_date', $today)
            ->when($shiftId !== null, fn ($q) => $q->where('staff_shift_id', $shiftId))
            ->orderByDesc('id')
            ->first();

        if ($direction === 'in') {
            if ($attendance !== null && $attendance->clocked_in_at !== null && $attendance->clocked_out_at === null) {
                throw ValidationException::withMessages(['direction' => __('api.staff_already_clocked_in')]);
            }

            $id = DB::table('staff_attendance')->insertGetId([
                'tenant_id' => $tenantId,
                'user_id' => $staff->id,
                'staff_shift_id' => $shiftId,
                'work_date' => $today,
                'clocked_in_at' => now(),
                'note' => $note,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return ['id' => $id, 'clocked_in_at' => now()->toIso8601String()];
        }

        if ($attendance === null || $attendance->clocked_in_at === null) {
            throw ValidationException::withMessages(['direction' => __('api.staff_not_clocked_in')]);
        }

        $in = Carbon::parse($attendance->clocked_in_at);
        $out = now();
        $hours = round(max(0, $in->diffInMinutes($out)) / 60, 2);

        // Anything past the scheduled end is overtime. Without a schedule there is nothing to
        // be over, so only a scheduled shift can generate it.
        $overtime = 0.0;
        if ($attendance->staff_shift_id !== null) {
            $planned = DB::table('staff_shifts')->where('id', $attendance->staff_shift_id)->first();
            if ($planned !== null) {
                $plannedHours = $this->hoursBetween((string) $planned->starts_at, (string) $planned->ends_at);
                $overtime = round(max(0, $hours - $plannedHours), 2);
            }
        }

        DB::table('staff_attendance')->where('id', $attendance->id)->update([
            'clocked_out_at' => $out,
            'hours' => $hours,
            'overtime_hours' => $overtime,
            'note' => $note ?? $attendance->note,
            'updated_at' => now(),
        ]);

        return ['id' => (int) $attendance->id, 'hours' => $hours, 'overtime_hours' => $overtime];
    }

    /** Who is on the clock right now — the number a manager needs during service. */
    public function onDuty(int $tenantId): array
    {
        return DB::table('staff_attendance as a')
            ->join('users as u', 'a.user_id', '=', 'u.id')
            ->where('a.tenant_id', $tenantId)
            ->whereNull('a.clocked_out_at')
            ->whereNotNull('a.clocked_in_at')
            ->select(['a.id', 'a.user_id', 'u.name', 'a.clocked_in_at'])
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'user_id' => (int) $row->user_id,
                'name' => $row->name,
                'since' => $row->clocked_in_at,
            ])
            ->values()
            ->all();
    }

    /** @param  array{user_id: int, type: string, starts_on: string, ends_on: string, reason?: string|null}  $data */
    public function requestLeave(User $staff, array $data): int
    {
        if (Carbon::parse((string) $data['ends_on'])->lt(Carbon::parse((string) $data['starts_on']))) {
            throw ValidationException::withMessages(['ends_on' => __('api.staff_leave_range_invalid')]);
        }

        return (int) DB::table('staff_leave_requests')->insertGetId([
            'tenant_id' => (int) $staff->tenant_id,
            'user_id' => (int) ($data['user_id'] ?? $staff->id),
            'type' => (string) $data['type'],
            'starts_on' => $data['starts_on'],
            'ends_on' => $data['ends_on'],
            'reason' => $data['reason'] ?? null,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function decideLeave(User $manager, int $leaveId, bool $approve, ?string $note = null): array
    {
        $tenantId = (int) $manager->tenant_id;

        $row = DB::table('staff_leave_requests')->where('tenant_id', $tenantId)->where('id', $leaveId)->first();
        if ($row === null) {
            throw ValidationException::withMessages(['leave' => __('api.staff_leave_not_found')]);
        }
        if ((string) $row->status !== 'pending') {
            throw ValidationException::withMessages(['leave' => __('api.staff_leave_already_decided')]);
        }

        DB::table('staff_leave_requests')->where('id', $leaveId)->update([
            'status' => $approve ? 'approved' : 'rejected',
            'decided_by' => $manager->id,
            'decided_at' => now(),
            'decision_note' => $note,
            'updated_at' => now(),
        ]);

        return ['id' => $leaveId, 'status' => $approve ? 'approved' : 'rejected'];
    }

    /** @return array<string, mixed> */
    private function presentShift(object $shift): array
    {
        return [
            'id' => (int) $shift->id,
            'user_id' => (int) $shift->user_id,
            'name' => $shift->staff_name ?? ('#'.$shift->user_id),
            'work_date' => $shift->work_date,
            'starts_at' => $shift->starts_at,
            'ends_at' => $shift->ends_at,
            'role' => $shift->role,
            'status' => $shift->status,
            'note' => $shift->note,
            'hours' => $this->hoursBetween((string) $shift->starts_at, (string) $shift->ends_at),
        ];
    }

    /** Hours in a shift, treating an end before the start as crossing midnight. */
    public function hoursBetween(string $start, string $end): float
    {
        $from = Carbon::parse('2000-01-01 '.substr($start, 0, 8));
        $to = Carbon::parse('2000-01-01 '.substr($end, 0, 8));

        if ($to->lessThanOrEqualTo($from)) {
            $to->addDay();
        }

        return round($from->diffInMinutes($to) / 60, 2);
    }
}
