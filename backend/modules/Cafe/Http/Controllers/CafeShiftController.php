<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\CapabilityChecker;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Cafe\Entities\CafeShift;
use Modules\Cafe\Entities\CafeShiftMovement;
use Modules\Cafe\Services\CafeShiftService;

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
    ) {}

    /**
     * The till this cashier is currently standing at, or null.
     */
    public function current(Request $request): \Illuminate\Http\JsonResponse
    {
        $shift = $this->shifts->currentShift($request->user());

        return response()->json(['data' => $shift ? $this->present($shift) : null]);
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

        return response()->json(['data' => $this->present($this->shifts->summarize($shift))]);
    }

    public function close(Request $request, CafeShift $shift): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $shift);

        $data = $request->validate([
            'counted_cash_minor' => ['required', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $closed = $this->shifts->closeShift($request->user(), $shift, $data);

        return response()->json(['data' => $this->present($closed)]);
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
        ];

        if ($withUser) {
            $payload['cashier'] = $shift->relationLoaded('user') && $shift->user
                ? ['id' => $shift->user->id, 'name' => $shift->user->name]
                : null;
        }

        return $payload;
    }
}
