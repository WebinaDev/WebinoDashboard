<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\CapabilityChecker;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Cafe\Entities\CafeShift;
use Modules\Cafe\Entities\CafeShiftMovement;
use Modules\Cafe\Services\CafeShiftService;
use Modules\Cafe\Services\DayCloseService;
use Modules\Cafe\Services\ShiftJournal;
use Modules\Cafe\Services\TillReports;

/**
 * Cashier till: open a shift, move cash, close the drawer, read history.
 *
 * A cashier sees their own shifts; anyone allowed to audit (orders.* / reports.shop /
 * accounting.manage) can read the whole tenant's history, which is what a manager and the
 * accountant need to investigate a variance.
 */
class CafeShiftController extends Controller
{
    public function __construct(
        private readonly CafeShiftService $shifts,
        private readonly CapabilityChecker $capabilities,
        private readonly TillReports $reports,
        private readonly ShiftJournal $journal,
        private readonly DayCloseService $days,
    ) {}

    /**
     * The till this cashier is currently standing at, or null.
     */
    public function current(Request $request): \Illuminate\Http\JsonResponse
    {
        $shift = $this->shifts->currentShift($request->user());

        if ($shift === null) {
            return response()->json(['data' => null]);
        }

        $payload = $this->present($shift);

        // Same rule as `show`: a blind drawer does not tell the cashier what it expects.
        if (! $this->canAudit($request) && $shift->counted_cash_minor === null) {
            $payload['expected_cash_minor'] = null;
            $payload['variance_minor'] = null;
            $payload['blind'] = true;
            if (is_array($payload['totals'])) {
                $payload['totals']['expected_cash_minor'] = null;
                $payload['totals']['variance_minor'] = null;
            }
        }

        return response()->json(['data' => $payload]);
    }

    public function open(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'opening_float_minor' => ['nullable', 'integer', 'min:0'],
            'branch_id' => ['nullable', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $request->user()->tenant_id)],
        ]);

        $shift = $this->shifts->openShift($request->user(), $data);

        return response()->json(['data' => $this->present($shift)], 201);
    }

    /**
     * Live reconciliation for the open shift — the numbers behind the "بستن شیفت" screen.
     */
    public function show(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $shift);

        $payload = $this->present($this->shifts->summarize($shift));

        // Blind count: the cashier does not get to see what the system expects before they
        // have committed a number. An auditor does — reconciling someone else is their job.
        if (! $this->canAudit($request) && $shift->counted_cash_minor === null) {
            $payload['expected_cash_minor'] = null;
            $payload['variance_minor'] = null;
            $payload['blind'] = true;
            if (is_array($payload['totals'])) {
                $payload['totals']['expected_cash_minor'] = null;
                $payload['totals']['variance_minor'] = null;
            }
        }

        return response()->json(['data' => $payload]);
    }

    public function close(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $shift);

        $data = $request->validate([
            'counted_cash_minor' => ['required', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
            'post_journal' => ['nullable', 'boolean'],
        ]);

        // A difference needs a second signature. A manager closing the drawer *is* that
        // signature; a cashier closing their own drawer is not.
        $approver = $this->canApprove($request) && $this->isNotOwnShift($request, $shift)
            ? $request->user()
            : null;

        $closed = $this->shifts->closeShift($request->user(), $shift, $data, $approver);

        $journal = null;
        $journalError = null;

        if ($request->boolean('post_journal', true)) {
            try {
                $result = $this->journal->post($closed);
                $journal = [
                    'id' => $result['journal']->id,
                    'number' => $result['journal']->number,
                    'created' => $result['created'],
                    'debit_minor' => (int) $result['journal']->total_debit_minor,
                    'credit_minor' => (int) $result['journal']->total_credit_minor,
                ];
            } catch (\Illuminate\Validation\ValidationException $e) {
                // A shift with no takings has nothing to post; that is not a reason to refuse
                // the close, which has already happened. Report why the ledger stayed empty.
                $journalError = collect($e->errors())->flatten()->first();
            }
        }

        return response()->json([
            'data' => $this->present($closed->fresh()),
            'journal' => $journal,
            'journal_error' => $journalError,
        ]);
    }

    /**
     * X report — a live snapshot, printable as often as the cashier likes.
     *
     * Never shows a variance to the person who has not counted yet: the comparison is the
     * manager's, and leaking it would defeat the blind count.
     */
    public function xReport(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $shift);

        $report = $this->reports->xReport($shift);

        if (! $this->canAudit($request) && $shift->counted_cash_minor === null) {
            $report['drawer']['expected_minor'] = null;
            $report['drawer']['variance_minor'] = null;
            $report['drawer']['blind'] = true;
        }

        return response()->json(['data' => $report]);
    }

    /** Z report — the closing document. Frozen once the shift is closed. */
    public function zReport(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $shift);

        return response()->json(['data' => $this->reports->zReport($shift)]);
    }

    /** Submit a blind count without closing. */
    public function submitCount(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $shift);

        $data = $request->validate([
            'counted_cash_minor' => ['required', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->shifts->submitCount(
            $request->user(),
            $shift,
            (int) $data['counted_cash_minor'],
            $data['note'] ?? null,
        );

        // The response deliberately omits the expected figure: this is the blind step.
        return response()->json([
            'data' => [
                'id' => $updated->id,
                'count_status' => $updated->count_status,
                'counted_cash_minor' => $updated->counted_cash_minor,
                'message' => __('api.cafe_shift_count_submitted'),
            ],
        ]);
    }

    public function approveCount(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertManager($request);

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $approved = $this->shifts->approveCount($request->user(), $shift, $data['note'] ?? null);

        return response()->json(['data' => $this->present($approved)]);
    }

    public function rejectCount(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertManager($request);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $rejected = $this->shifts->rejectCount($request->user(), $shift, $data['reason']);

        return response()->json(['data' => $this->present($rejected)]);
    }

    /** Drawers waiting for a manager: the approval queue. */
    public function pendingCounts(Request $request): \Illuminate\Http\JsonResponse
    {
        $this->assertManager($request);

        $rows = CafeShift::query()
            ->where('tenant_id', (int) $request->user()->tenant_id)
            ->where('count_status', CafeShift::COUNT_PENDING)
            ->with('user:id,name')
            ->orderBy('counted_at')
            ->limit(100)
            ->get();

        return response()->json([
            'data' => $rows->map(fn (CafeShift $shift) => $this->present($shift, false) + [
                'cashier' => $shift->user?->name,
                'counted_cash_minor' => $shift->counted_cash_minor,
                'counted_at' => $shift->counted_at,
            ])->values(),
        ]);
    }

    /** Post (or re-read) the shift's sales journal. */
    public function postJournal(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $shift);

        if ($shift->isOpen()) {
            // Posting an open drawer would freeze a number that is still moving.
            return response()->json(['message' => __('api.cafe_shift_open_cannot_post')], 422);
        }

        $result = $this->journal->post($shift);

        return response()->json([
            'data' => [
                'journal_entry_id' => $result['journal']->id,
                'number' => $result['journal']->number,
                'created' => $result['created'],
                'total_debit_minor' => (int) $result['journal']->total_debit_minor,
                'total_credit_minor' => (int) $result['journal']->total_credit_minor,
            ],
        ]);
    }

    // ------------------------------------------------------------------ day close ---

    /** Preview the day: totals, per-shift rows, and whether it can be closed. */
    public function dayPreview(Request $request): \Illuminate\Http\JsonResponse
    {
        $this->assertManager($request);

        $data = $request->validate([
            'business_date' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer'],
        ]);

        $report = $this->days->preview(
            (int) $request->user()->tenant_id,
            $data['business_date'] ?? now()->toDateString(),
            isset($data['branch_id']) ? (int) $data['branch_id'] : null,
        );

        return response()->json(['data' => $report]);
    }

    public function dayClose(Request $request): \Illuminate\Http\JsonResponse
    {
        $this->assertManager($request);

        $data = $request->validate([
            'business_date' => ['required', 'date'],
            'branch_id' => ['nullable', 'integer'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $close = $this->days->close($request->user(), $data);

        return response()->json(['data' => $this->presentDayClose($close)], 201);
    }

    public function dayHistory(Request $request): \Illuminate\Http\JsonResponse
    {
        $this->assertManager($request);

        return response()->json([
            'data' => $this->days->history((int) $request->user()->tenant_id),
        ]);
    }

    /** @return array<string, mixed> */
    private function presentDayClose(\Modules\Cafe\Entities\CafeDayClose $close): array
    {
        return [
            'id' => $close->id,
            'business_date' => $close->business_date?->toDateString(),
            'branch_id' => $close->branch_id,
            'status' => $close->status,
            'shifts' => $close->shifts,
            'gross_sales_minor' => $close->gross_sales_minor,
            'cash_sales_minor' => $close->cash_sales_minor,
            'non_cash_sales_minor' => $close->non_cash_sales_minor,
            'discounts_minor' => $close->discounts_minor,
            'tax_minor' => $close->tax_minor,
            'expected_cash_minor' => $close->expected_cash_minor,
            'counted_cash_minor' => $close->counted_cash_minor,
            'variance_minor' => $close->variance_minor,
            'note' => $close->note,
            'closed_at' => $close->closed_at,
        ];
    }

    /** Approving a count or closing the day is a manager act, by capability. */
    private function assertManager(Request $request): void
    {
        abort_unless($this->canApprove($request), 403);
    }

    private function canApprove(Request $request): bool
    {
        $user = $request->user();
        if ($user === null) {
            return false;
        }

        if ((string) $user->role === 'admin') {
            return true;
        }

        foreach (['pos.approve', 'accounting.approve', 'reports.shop', 'accounting.manage', 'orders.*'] as $capability) {
            if ($this->capabilities->allows($user, $capability)) {
                return true;
            }
        }

        return false;
    }

    private function isNotOwnShift(Request $request, CafeShift $shift): bool
    {
        return (int) $shift->user_id !== (int) $request->user()->id;
    }

    public function storeMovement(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $shift);

        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(CafeShiftMovement::TYPES)],
            // Cash movements must carry a value; no_sale / note are records, not money.
            'amount_minor' => ['nullable', 'integer', 'min:0', 'required_unless:type,no_sale,note'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $movement = $this->shifts->addMovement($request->user(), $shift, $data);

        return response()->json([
            'data' => [
                'id' => $movement->id,
                'type' => $movement->type,
                'amount_minor' => $movement->amount_minor,
                'reason' => $movement->reason,
                'created_at' => $movement->created_at,
                'shift' => $this->present($this->shifts->summarize($shift)),
            ],
        ], 201);
    }

    /**
     * Shift history. Managers and accountants filter by cashier and date to find a variance.
     */
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        $tenantId = (int) $user->tenant_id;

        $query = CafeShift::query()
            ->where('tenant_id', $tenantId)
            ->with(['user:id,name,email'])
            ->orderByDesc('id');

        if (! $this->canAudit($request)) {
            $query->where('user_id', $user->id);
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->query('user_id'));
        }

        if ($request->filled('from')) {
            $query->where('opened_at', '>=', $request->query('from'));
        }

        if ($request->filled('to')) {
            $query->where('opened_at', '<=', $request->query('to'));
        }

        // "Only the drawers that did not balance" — the first thing anyone looks for.
        if ($request->boolean('variance_only')) {
            $query->where('status', CafeShift::STATUS_CLOSED)->where('variance_minor', '!=', 0);
        }

        $shifts = $query->limit(200)->get();

        return response()->json([
            'data' => $shifts->map(fn (CafeShift $shift) => $this->present($shift, false))->values(),
            'meta' => [
                'can_audit' => $this->canAudit($request),
            ],
        ]);
    }

    public function movements(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $shift);

        $rows = CafeShiftMovement::query()
            ->where('tenant_id', (int) $shift->tenant_id)
            ->where('shift_id', $shift->id)
            ->with('user:id,name')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * Auditors = anyone who may see other people's money. Mirrors the route middleware.
     */
    private function canAudit(Request $request): bool
    {
        $user = $request->user();

        if ($user === null) {
            return false;
        }

        if ((string) $user->role === 'admin') {
            return true;
        }

        foreach (['orders.*', 'reports.shop', 'accounting.manage'] as $capability) {
            if ($this->capabilities->allows($user, $capability)) {
                return true;
            }
        }

        return false;
    }

    private function assertVisible(Request $request, CafeShift $shift): void
    {
        abort_if((int) $request->user()->tenant_id !== (int) $shift->tenant_id, 403);

        $isOwn = (int) $shift->user_id === (int) $request->user()->id;
        abort_unless($isOwn || $this->canAudit($request), 403);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(CafeShift $shift, bool $withUser = true): array
    {
        $totals = is_array($shift->totals) ? $shift->totals : [];

        $payload = [
            'id' => $shift->id,
            'status' => $shift->status,
            'branch_id' => $shift->branch_id,
            'opening_float_minor' => (int) $shift->opening_float_minor,
            'counted_cash_minor' => $shift->counted_cash_minor,
            'expected_cash_minor' => $shift->expected_cash_minor,
            'variance_minor' => (int) $shift->variance_minor,
            'varied' => (int) $shift->variance_minor !== 0 && $shift->counted_cash_minor !== null,
            'note' => $shift->note,
            'opened_at' => $shift->opened_at,
            'closed_at' => $shift->closed_at,
            'totals' => $totals,
            'count_status' => $shift->count_status,
            'counted_by' => $shift->counted_by,
            'counted_at' => $shift->counted_at,
            'approved_by' => $shift->approved_by,
            'approved_at' => $shift->approved_at,
            'approval_note' => $shift->approval_note,
            'journal_entry_id' => $shift->journal_entry_id,
            'day_close_id' => $shift->day_close_id,
        ];

        if ($withUser) {
            $payload['cashier'] = $shift->relationLoaded('user') && $shift->user
                ? ['id' => $shift->user->id, 'name' => $shift->user->name]
                : null;
        }

        return $payload;
    }
}
