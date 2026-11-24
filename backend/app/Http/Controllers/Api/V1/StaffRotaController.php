<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Staff\PayrollService;
use App\Services\Staff\ScheduleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Staff operations: the rota, attendance, leave and payroll.
 *
 * Distinct from `StaffController`, which is user administration (creating an account, changing
 * a role). This one is about the working week and the payslip.
 *
 * Two audiences, deliberately separated by capability:
 *
 *  - A **staff member** clocks themselves in and out, sees their own rota and requests leave.
 *  - A **manager** builds and publishes the rota, decides leave, and runs payroll.
 *
 * Mixing them is how a pay screen ends up readable by the person being paid by it.
 */
class StaffRotaController extends Controller
{
    public function __construct(
        private readonly ScheduleService $schedule,
        private readonly PayrollService $payroll,
    ) {}

    // ------------------------------------------------------------------- rota ---

    public function week(Request $request): JsonResponse
    {
        $data = $request->validate([
            'week_start' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer'],
        ]);

        $weekStart = $data['week_start'] ?? now()->toDateString();

        $week = $this->schedule->week(
            (int) $request->user()->tenant_id,
            $weekStart,
            isset($data['branch_id']) ? (int) $data['branch_id'] : null,
        );

        // A staff member without the manager capability sees their own week only — nobody
        // else's hours, and no total they could subtract from.
        if (! $this->canManage($request)) {
            $week['days'] = array_map(function (array $day) use ($request): array {
                $day['shifts'] = array_values(array_filter(
                    $day['shifts'],
                    fn (array $shift) => (int) $shift['user_id'] === (int) $request->user()->id,
                ));

                return $day;
            }, $week['days']);

            $week['total_hours'] = round(array_sum(array_map(
                fn (array $day) => array_sum(array_column($day['shifts'], 'hours')),
                $week['days'],
            )), 2);
        }

        return response()->json(['data' => $week]);
    }

    public function saveShifts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'shifts' => ['required', 'array', 'max:200'],
            'shifts.*.user_id' => ['required', 'integer', 'min:1'],
            'shifts.*.work_date' => ['required', 'date'],
            'shifts.*.starts_at' => ['required', 'date_format:H:i'],
            'shifts.*.ends_at' => ['required', 'date_format:H:i'],
            'shifts.*.role' => ['nullable', 'string', 'max:40'],
            'shifts.*.note' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $this->schedule->saveShifts(
            $request->user(),
            $data['shifts'],
            isset($data['branch_id']) ? (int) $data['branch_id'] : null,
        );

        return response()->json(['data' => $result]);
    }

    public function publish(Request $request): JsonResponse
    {
        $data = $request->validate([
            'week_start' => ['required', 'date'],
            'branch_id' => ['nullable', 'integer'],
        ]);

        $count = $this->schedule->publishWeek(
            (int) $request->user()->tenant_id,
            (string) $data['week_start'],
            isset($data['branch_id']) ? (int) $data['branch_id'] : null,
        );

        return response()->json(['data' => ['published' => $count]]);
    }

    public function destroyShift(Request $request, int $shift): JsonResponse
    {
        $deleted = $this->schedule->deleteShift((int) $request->user()->tenant_id, $shift);

        return response()->json(['data' => ['deleted' => $deleted]]);
    }

    // ------------------------------------------------------------- attendance ---

    /** Clock yourself in or out. Anyone may do this for themselves. */
    public function clock(Request $request): JsonResponse
    {
        $data = $request->validate([
            'direction' => ['required', 'in:in,out'],
            'shift_id' => ['nullable', 'integer'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $this->schedule->clock(
            $request->user(),
            (string) $data['direction'],
            isset($data['shift_id']) ? (int) $data['shift_id'] : null,
            $data['note'] ?? null,
        );

        return response()->json(['data' => $result], $data['direction'] === 'in' ? 201 : 200);
    }

    public function shiftIndex(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->schedule->onDuty((int) $request->user()->tenant_id)]);
    }

    // ------------------------------------------------------------------ leave ---

    public function requestLeave(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['nullable', 'integer', 'min:1'],
            'type' => ['required', 'in:annual,sick,unpaid'],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        // Only a manager may file leave for somebody else.
        if (isset($data['user_id']) && (int) $data['user_id'] !== (int) $request->user()->id && ! $this->canManage($request)) {
            abort(403);
        }

        $id = $this->schedule->requestLeave($request->user(), $data);

        return response()->json(['data' => ['id' => $id, 'status' => 'pending']], 201);
    }

    public function leaveIndex(Request $request): JsonResponse
    {
        $query = DB::table('staff_leave_requests as l')
            ->leftJoin('users as u', 'l.user_id', '=', 'u.id')
            ->where('l.tenant_id', (int) $request->user()->tenant_id)
            ->select(['l.*', 'u.name as staff_name'])
            ->orderByDesc('l.id')
            ->limit(200);

        if (! $this->canManage($request)) {
            $query->where('l.user_id', (int) $request->user()->id);
        }

        if ($request->filled('status')) {
            $query->where('l.status', (string) $request->query('status'));
        }

        return response()->json([
            'data' => $query->get()->map(fn ($row) => [
                'id' => (int) $row->id,
                'user_id' => (int) $row->user_id,
                'name' => $row->staff_name,
                'type' => $row->type,
                'starts_on' => $row->starts_on,
                'ends_on' => $row->ends_on,
                'reason' => $row->reason,
                'status' => $row->status,
                'decision_note' => $row->decision_note,
            ])->values(),
        ]);
    }

    public function decideLeave(Request $request, int $leave): JsonResponse
    {
        $data = $request->validate([
            'approve' => ['required', 'boolean'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        return response()->json([
            'data' => $this->schedule->decideLeave(
                $request->user(),
                $leave,
                (bool) $data['approve'],
                $data['note'] ?? null,
            ),
        ]);
    }

    // ---------------------------------------------------------------- payroll ---

    public function payrollRuns(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->payroll->listRuns((int) $request->user()->tenant_id),
        ]);
    }

    public function payrollShow(Request $request, int $run): JsonResponse
    {
        return response()->json([
            'data' => $this->payroll->presentRun((int) $request->user()->tenant_id, $run),
        ]);
    }

    public function payrollBuild(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
        ]);

        return response()->json([
            'data' => $this->payroll->buildRun($request->user(), $data),
        ], 201);
    }

    public function payrollPost(Request $request, int $run): JsonResponse
    {
        return response()->json([
            'data' => $this->payroll->postRun($request->user(), $run),
        ]);
    }

    // -------------------------------------------------------------- contracts ---

    public function contracts(Request $request): JsonResponse
    {
        $rows = DB::table('staff_contracts as c')
            ->leftJoin('users as u', 'c.user_id', '=', 'u.id')
            ->where('c.tenant_id', (int) $request->user()->tenant_id)
            ->select(['c.*', 'u.name as staff_name'])
            ->orderByDesc('c.is_active')
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'user_id' => (int) $row->user_id,
                'name' => $row->staff_name,
                'pay_type' => $row->pay_type,
                'base_rate_minor' => (int) $row->base_rate_minor,
                'weekly_hours' => (float) $row->weekly_hours,
                'employee_insurance_percent' => (float) $row->employee_insurance_percent,
                'employer_insurance_percent' => (float) $row->employer_insurance_percent,
                'overtime_multiplier' => (float) $row->overtime_multiplier,
                'is_active' => (bool) $row->is_active,
            ]);

        return response()->json(['data' => $rows]);
    }

    public function saveContract(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['nullable', 'integer', 'min:1'],
            'user_id' => ['required', 'integer', 'min:1'],
            'pay_type' => ['required', 'in:monthly,hourly,daily'],
            'base_rate_minor' => ['required', 'integer', 'min:0'],
            'weekly_hours' => ['nullable', 'numeric', 'min:1', 'max:168'],
            'employee_insurance_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'employer_insurance_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'overtime_multiplier' => ['nullable', 'numeric', 'min:1', 'max:5'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $tenantId = (int) $request->user()->tenant_id;

        // The employee has to exist in this tenant; a contract to a stranger is a data error.
        User::query()->where('tenant_id', $tenantId)->findOrFail((int) $data['user_id']);

        $payload = [
            'tenant_id' => $tenantId,
            'user_id' => (int) $data['user_id'],
            'pay_type' => (string) $data['pay_type'],
            'base_rate_minor' => (int) $data['base_rate_minor'],
            'weekly_hours' => (float) ($data['weekly_hours'] ?? 44),
            'employee_insurance_percent' => (float) ($data['employee_insurance_percent'] ?? 7),
            'employer_insurance_percent' => (float) ($data['employer_insurance_percent'] ?? 23),
            'overtime_multiplier' => (float) ($data['overtime_multiplier'] ?? 1.4),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'updated_at' => now(),
        ];

        if (! empty($data['id'])) {
            DB::table('staff_contracts')->where('tenant_id', $tenantId)->where('id', (int) $data['id'])->update($payload);
            $id = (int) $data['id'];
        } else {
            $id = (int) DB::table('staff_contracts')->insertGetId($payload + ['created_at' => now()]);
        }

        return response()->json(['data' => ['id' => $id]], 201);
    }

    /** Building a rota, deciding leave or running payroll is a manager act. */
    private function canManage(Request $request): bool
    {
        $user = $request->user();
        if ($user === null) {
            return false;
        }
        if ((string) $user->role === 'admin') {
            return true;
        }

        $caps = app(\App\Support\CapabilityChecker::class);

        // Deliberately not `reports.shop`: reading a sales report is not authority over
        // someone else's hours or pay.
        foreach (['staff.manage', 'users.manage', 'accounting.manage', 'pos.approve'] as $capability) {
            if ($caps->allows($user, $capability)) {
                return true;
            }
        }

        return false;
    }
}
