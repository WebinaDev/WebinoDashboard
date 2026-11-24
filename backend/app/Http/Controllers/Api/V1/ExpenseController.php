<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Accounting\ExpensePosting;
use App\Services\Accounting\PartyLedger;
use App\Services\Accounting\FixedAssets;
use App\Services\Accounting\SupplierBills;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Expenses, supplier bills and customer credit.
 *
 * These three arrived together because they answer one question — what does this shop owe and
 * what is it owed — and each of them was previously only expressible as a hand-written journal.
 */
class ExpenseController extends Controller
{
    public function __construct(
        private readonly ExpensePosting $expenses,
        private readonly SupplierBills $bills,
        private readonly PartyLedger $parties,
        private readonly FixedAssets $assets,
    ) {}

    /** The categories the form offers, with their default chart code. */
    public function categories(): JsonResponse
    {
        return response()->json(['data' => [
            'categories' => collect(ExpensePosting::CATEGORIES)
                ->map(fn (array $meta, string $key): array => ['key' => $key, 'code' => $meta['code'], 'name' => $meta['name']])
                ->values()
                ->all(),
        ]]);
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $rows = DB::table('expenses as e')
            ->leftJoin('acc_cash_accounts as c', 'e.cash_account_id', '=', 'c.id')
            ->where('e.tenant_id', $tenantId)
            ->when($request->filled('category'), fn ($q) => $q->where('e.category', (string) $request->input('category')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('e.spent_on', '>=', (string) $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('e.spent_on', '<=', (string) $request->input('to')))
            ->orderByDesc('e.spent_on')
            ->orderByDesc('e.id')
            ->limit(200)
            ->get([
                'e.id', 'e.title', 'e.category', 'e.amount_minor', 'e.spent_on', 'e.reference',
                'e.notes', 'e.expense_account_code', 'e.payment_account_code', 'e.journal_entry_id',
                'c.name as cash_account_name',
            ]);

        return response()->json(['data' => [
            'expenses' => $rows,
            'total_minor' => (float) $rows->sum('amount_minor'),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:191'],
            'amount_minor' => ['required', 'numeric', 'gt:0'],
            'spent_on' => ['nullable', 'date'],
            'category' => ['nullable', 'string', 'max:40'],
            'cash_account_id' => ['nullable', 'integer'],
            'reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $result = $this->expenses->record((int) $request->user()->tenant_id, $data, (int) $request->user()->id);

        return response()->json(['data' => $result], 201);
    }

    // --- supplier bills ---------------------------------------------------------------

    public function bills(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $rows = DB::table('supplier_invoices as b')
            ->leftJoin('acc_persons as p', 'b.supplier_id', '=', 'p.id')
            ->where('b.tenant_id', $tenantId)
            ->when($request->filled('status'), fn ($q) => $q->where('b.status', (string) $request->input('status')))
            ->orderBy('b.due_on')
            ->orderByDesc('b.id')
            ->limit(200)
            ->get([
                'b.id', 'b.number', 'b.supplier_reference', 'b.issued_on', 'b.due_on', 'b.status',
                'b.total_minor', 'b.paid_minor', 'p.name as supplier_name', 'b.purchase_order_id',
            ])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'number' => $row->number,
                'supplier_reference' => $row->supplier_reference,
                'issued_on' => $row->issued_on,
                'due_on' => $row->due_on,
                'status' => $row->status,
                'total_minor' => (float) $row->total_minor,
                'paid_minor' => (float) $row->paid_minor,
                'remaining_minor' => round((float) $row->total_minor - (float) $row->paid_minor, 2),
                'supplier_name' => $row->supplier_name,
                'purchase_order_id' => $row->purchase_order_id,
                // An overdue payable is the number a manager has to act on.
                'overdue' => $row->status === 'open' && $row->due_on !== null && (string) $row->due_on < now()->toDateString(),
            ])
            ->values()
            ->all();

        return response()->json(['data' => [
            'bills' => $rows,
            'outstanding_minor' => array_sum(array_column($rows, 'remaining_minor')),
        ]]);
    }

    public function storeBill(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['nullable', 'integer'],
            'purchase_order_id' => ['nullable', 'integer'],
            'number' => ['nullable', 'string', 'max:50'],
            'supplier_reference' => ['nullable', 'string', 'max:100'],
            'issued_on' => ['nullable', 'date'],
            'due_on' => ['nullable', 'date'],
            'total_minor' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $result = $this->bills->create((int) $request->user()->tenant_id, $data, (int) $request->user()->id);

        return response()->json(['data' => $result], 201);
    }

    public function payBill(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'amount_minor' => ['required', 'numeric', 'gt:0'],
            'cash_account_id' => ['nullable', 'integer'],
        ]);

        $result = $this->bills->pay(
            (int) $request->user()->tenant_id,
            $id,
            (float) $data['amount_minor'],
            isset($data['cash_account_id']) ? (int) $data['cash_account_id'] : null,
            (int) $request->user()->id,
        );

        return response()->json(['data' => $result]);
    }

    // --- customer credit --------------------------------------------------------------

    /** The statement of account: every document, with a running balance. */
    public function statement(Request $request, int $personId): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        return response()->json(['data' => $this->parties->statement(
            (int) $request->user()->tenant_id,
            $personId,
            $request->filled('from') ? (string) $request->input('from') : null,
            $request->filled('to') ? (string) $request->input('to') : null,
        )]);
    }

    /** Set or clear a credit limit, and block or unblock. */
    public function updateParty(Request $request, int $personId): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'credit_limit' => ['sometimes', 'numeric', 'min:0'],
            'is_blocked' => ['sometimes', 'boolean'],
        ]);

        $exists = DB::table('acc_persons')->where('tenant_id', $tenantId)->where('id', $personId)->exists();

        abort_if(! $exists, 404);

        DB::table('acc_persons')->where('id', $personId)->update(array_merge(
            $data,
            ['updated_at' => now()],
        ));

        return response()->json(['data' => [
            'person_id' => $personId,
            'balance_minor' => $this->parties->balance($tenantId, $personId),
            'credit_limit' => (float) ($data['credit_limit'] ?? DB::table('acc_persons')->where('id', $personId)->value('credit_limit')),
        ]]);
    }

    // --- fixed assets -----------------------------------------------------------------

    public function assets(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $register = $this->assets->register($tenantId);

        return response()->json(['data' => [
            'assets' => $register,
            'cost_minor' => array_sum(array_column($register, 'cost_minor')),
            'book_value_minor' => array_sum(array_column($register, 'book_value_minor')),
        ]]);
    }

    public function storeAsset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'category' => ['nullable', 'string', 'max:60'],
            'serial_no' => ['nullable', 'string', 'max:100'],
            'acquired_on' => ['nullable', 'date'],
            'cost_minor' => ['required', 'numeric', 'gt:0'],
            'salvage_minor' => ['nullable', 'numeric', 'min:0'],
            'useful_life_months' => ['nullable', 'integer', 'min:1', 'max:600'],
            'on_credit' => ['nullable', 'boolean'],
            'paid_from_code' => ['nullable', 'string', 'max:20'],
        ]);

        $result = $this->assets->create((int) $request->user()->tenant_id, $data, (int) $request->user()->id);

        return response()->json(['data' => $result], 201);
    }

    public function depreciate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period' => ['nullable', 'string', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $result = $this->assets->depreciate(
            (int) $request->user()->tenant_id,
            $data['period'] ?? null,
            (int) $request->user()->id,
        );

        return response()->json(['data' => $result]);
    }

    public function disposeAsset(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'proceeds_minor' => ['nullable', 'numeric', 'min:0'],
            'disposed_on' => ['nullable', 'date'],
        ]);

        $result = $this->assets->dispose(
            (int) $request->user()->tenant_id,
            $id,
            (float) ($data['proceeds_minor'] ?? 0),
            $data['disposed_on'] ?? null,
            (int) $request->user()->id,
        );

        return response()->json(['data' => $result]);
    }

    /** Every party with a balance, for the credit-control screen. */
    public function parties(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $persons = DB::table('acc_persons')
            ->where('tenant_id', $tenantId)
            ->orderBy('name')
            ->limit(300)
            ->get(['id', 'name', 'mobile', 'type', 'credit_limit', 'is_blocked']);

        $rows = $persons->map(function ($person) use ($tenantId): array {
            $balance = $this->parties->balance($tenantId, (int) $person->id);

            return [
                'id' => (int) $person->id,
                'name' => $person->name,
                'mobile' => $person->mobile,
                'type' => $person->type,
                'credit_limit' => (float) ($person->credit_limit ?? 0),
                'is_blocked' => (bool) ($person->is_blocked ?? false),
                'balance_minor' => $balance,
                'available_minor' => round(max(0, (float) ($person->credit_limit ?? 0) - $balance), 2),
                'over_limit' => (float) ($person->credit_limit ?? 0) > 0 && $balance > (float) $person->credit_limit,
            ];
        })->values()->all();

        return response()->json(['data' => ['parties' => $rows]]);
    }
}
