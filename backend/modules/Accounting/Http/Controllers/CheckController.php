<?php

namespace Modules\Accounting\Http\Controllers;

use App\Services\Accounting\ChequeLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccCheck;

/**
 * Cheques, and what happens to the books when one moves.
 *
 * The status change used to touch nothing but the status column: a cheque that bounced left the
 * bank balance as though it had been paid, and a customer's cheque sat in receivables until it
 * cleared instead of becoming an asset the day it arrived.
 */
class CheckController extends Controller
{
    public function __construct(private readonly ChequeLedger $ledger) {}

    public function checks(Request $request): JsonResponse
    {
        $q = AccCheck::query()->with(['cashAccount', 'person'])->orderByDesc('id');
        if ($request->filled('status')) {
            $q->where('status', $request->input('status'));
        }

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 25), 100))]);
    }

    /**
     * Record a cheque.
     *
     * A cheque written down is a fact, so the receipt posts here rather than waiting for someone
     * to remember to change a status next week. Recording one straight into a later status
     * posts only that status's movement.
     */
    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'type' => ['required', 'in:receivable,payable'],
            'number' => ['nullable', 'string', 'max:50'],
            'bank' => ['nullable', 'string', 'max:191'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'due_date' => ['nullable', 'date'],
            'status' => ['nullable', 'in:issued,deposited,cleared,bounced,returned,pending,collected'],
            'cash_account_id' => ['nullable', 'integer'],
            'person_id' => ['nullable', 'integer'],
        ]);

        $check = AccCheck::query()->create(array_merge($data, [
            'tenant_id' => $tenantId,
            'status' => $data['status'] ?? 'issued',
        ]));

        $this->ledger->record($tenantId, (int) $check->id, (int) $request->user()->id);

        return response()->json(['data' => $check->fresh(['cashAccount', 'person'])], 201);
    }

    public function setCheckStatus(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status' => 'required|string|in:issued,deposited,cleared,bounced,returned',
            // Mandatory for a bounce, ignored otherwise.
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $existing = AccCheck::query()->findOrFail($id);

        $check = $this->ledger->setStatus(
            (int) $request->user()->tenant_id,
            (int) $existing->id,
            (string) $data['status'],
            isset($data['note']) ? (string) $data['note'] : null,
            (int) $request->user()->id,
        );

        return response()->json(['data' => $check]);
    }
}
