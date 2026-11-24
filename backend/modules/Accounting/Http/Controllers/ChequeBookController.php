<?php

namespace Modules\Accounting\Http\Controllers;

use App\Services\Accounting\ChequeBook as ChequeBookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccChequeBook;

/**
 * Cheque books — the paper behind the cheques.
 *
 * The cheque screen records what was written; this records which leaf it was written on, so a
 * book can be reconciled against the bank's serial range instead of against memory.
 */
class ChequeBookController extends Controller
{
    public function __construct(private readonly ChequeBookService $books) {}

    public function index(Request $request): JsonResponse
    {
        $rows = AccChequeBook::query()
            ->with('cashAccount')
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true))
            ->orderByDesc('id')
            ->get()
            ->map(function (AccChequeBook $book): array {
                $counts = $book->leaves()
                    ->selectRaw('status, COUNT(*) as c')
                    ->groupBy('status')
                    ->pluck('c', 'status');

                return [
                    'id' => $book->id,
                    'title' => $book->title,
                    'bank' => $book->bank,
                    'cash_account_id' => $book->cash_account_id,
                    'cash_account' => $book->cashAccount?->name,
                    'series_from' => $book->series_from,
                    'series_to' => $book->series_to,
                    'is_active' => (bool) $book->is_active,
                    'leaves' => [
                        'total' => (int) $counts->sum(),
                        'unused' => (int) ($counts['unused'] ?? 0),
                        'issued' => (int) ($counts['issued'] ?? 0),
                        'cancelled' => (int) ($counts['cancelled'] ?? 0),
                        'lost' => (int) ($counts['lost'] ?? 0),
                    ],
                ];
            })
            ->values();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:191'],
            'bank' => ['nullable', 'string', 'max:191'],
            'series_from' => ['required'],
            'series_to' => ['required'],
            'void_from' => ['nullable', 'integer'],
            'void_to' => ['nullable', 'integer'],
            'cash_account_id' => ['nullable', 'integer'],
            'notes' => ['nullable', 'string'],
        ]);

        $book = $this->books->open((int) $request->user()->tenant_id, $data, (int) $request->user()->id);

        return response()->json(['data' => [
            'id' => $book->id,
            'title' => $book->title,
            'series_from' => $book->series_from,
            'series_to' => $book->series_to,
            'leaves' => $book->leaves->count(),
        ]], 201);
    }

    /** Issue a cheque on a named leaf: the check and the leaf are written together. */
    public function issue(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'leaf_number' => ['required', 'integer', 'min:1'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'person_id' => ['nullable', 'integer'],
            'due_date' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:255'],
            'type' => ['nullable', 'in:payable,receivable'],
        ]);

        return response()->json(['data' => $this->books->issue(
            (int) $request->user()->tenant_id,
            $id,
            $data,
            (int) $request->user()->id,
        )], 201);
    }

    /** Cancel or report a leaf lost. Both consume the serial, neither deletes it. */
    public function spoil(Request $request, int $id, int $leaf): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:cancelled,lost'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $row = $this->books->spoil(
            (int) $request->user()->tenant_id,
            $id,
            $leaf,
            (string) $data['status'],
            $data['note'] ?? null,
        );

        return response()->json(['data' => $row]);
    }

    public function reconcile(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->books->reconcile((int) $request->user()->tenant_id, $id)]);
    }
}
