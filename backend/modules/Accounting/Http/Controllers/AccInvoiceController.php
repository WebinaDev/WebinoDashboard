<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Accounting\Entities\AccChartAccount;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccJournalLine;
use Modules\Accounting\Entities\AccountingInvoice;
use Modules\Accounting\Services\AccountingProvisioningService;
use Modules\Accounting\Support\AppliesIndexQuery;
use Modules\Accounting\Support\ExistsForTenant;

class AccInvoiceController extends Controller
{
    use AppliesIndexQuery;

    public function invoices(Request $request): JsonResponse
    {
        $query = AccountingInvoice::query()->with(['person', 'fiscalYear']);

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('fiscal_year_id')) {
            $query->where('fiscal_year_id', $request->input('fiscal_year_id'));
        }
        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        $paginator = $this->applyIndexQuery(
            $query,
            $request,
            [],
            ['number'],
            ['id', 'document_date', 'created_at'],
        );

        return $this->paginatedJsonResponse($paginator);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['data' => AccountingInvoice::query()->with(['person', 'fiscalYear'])->findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => 'nullable|string|max:50',
            'number' => 'nullable|string|max:100',
            'fiscal_year_id' => ['nullable', ExistsForTenant::in('acc_fiscal_years')],
            'person_id' => ['nullable', ExistsForTenant::in('acc_persons')],
            'document_date' => 'nullable|date',
            'items' => 'nullable|array',
            'subtotal' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'total' => 'required|numeric|min:0',
        ]);

        $row = AccountingInvoice::query()->create($data + [
            'status' => 'draft',
            'created_by' => $request->user()->id,
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = AccountingInvoice::query()->findOrFail($id);

        if ($row->status === 'posted') {
            return response()->json(['message' => __('messages.posted_invoice_is_immutable')], 422);
        }

        $data = $request->validate([
            'type' => 'nullable|string|max:50',
            'number' => 'nullable|string|max:100',
            'fiscal_year_id' => ['nullable', ExistsForTenant::in('acc_fiscal_years')],
            'person_id' => ['nullable', ExistsForTenant::in('acc_persons')],
            'document_date' => 'nullable|date',
            'items' => 'nullable|array',
            'subtotal' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'total' => 'sometimes|numeric|min:0',
        ]);

        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        $row = AccountingInvoice::query()->findOrFail($id);

        if ($row->status === 'posted') {
            return response()->json(['message' => __('messages.posted_invoice_is_immutable')], 422);
        }

        $row->delete();

        return response()->json([], 204);
    }

    public function nextInvoiceNumber(Request $request): JsonResponse
    {
        $request->validate(['fiscal_year_id' => ['nullable', ExistsForTenant::in('acc_fiscal_years')]]);
        $q = AccountingInvoice::query()->orderByDesc('id');
        if ($request->filled('fiscal_year_id')) {
            $q->where('fiscal_year_id', $request->input('fiscal_year_id'));
        }
        $last = $q->value('number');
        $next = is_string($last) && preg_match('/(\d+)$/', $last, $m)
            ? preg_replace('/\d+$/', str_pad((string) ((int) $m[1] + 1), strlen($m[1]), '0', STR_PAD_LEFT), $last)
            : 'INV-'.Str::upper(Str::random(6));

        return response()->json(['data' => ['next_number' => $next]]);
    }

    public function confirmInvoice(Request $request, int $id): JsonResponse
    {
        $inv = AccountingInvoice::query()->findOrFail($id);
        if ($inv->status === 'posted') {
            return response()->json(['message' => __('messages.already_posted')], 422);
        }

        $ar = AccChartAccount::query()->where('code', '113')->where('is_postable', true)->first();
        $rev = AccChartAccount::query()->where('code', '401')->where('is_postable', true)->first();

        // First invoice on a fresh tenant: seed the default chart instead of
        // failing with "seed chart" — the operator should not need to know.
        if (! $ar || ! $rev) {
            app(AccountingProvisioningService::class)
                ->ensureSeededForTenant((int) $request->user()->tenant_id);

            $ar = AccChartAccount::query()->where('code', '113')->where('is_postable', true)->first();
            $rev = AccChartAccount::query()->where('code', '401')->where('is_postable', true)->first();
        }

        if (! $ar || ! $rev) {
            return response()->json(['message' => __('messages.chart_accounts_113_and_401_required_seed_chart')], 422);
        }

        $total = (float) $inv->total;
        DB::transaction(function () use ($inv, $ar, $rev, $total, $request) {
            $je = AccJournalEntry::query()->create([
                'fiscal_year_id' => $inv->fiscal_year_id,
                'document_no' => 'INV-'.$inv->id,
                'document_date' => $inv->document_date ?? now(),
                'description' => 'Invoice confirm #'.$inv->id,
                'status' => 'posted',
                'created_by' => $request->user()->id,
            ]);
            AccJournalLine::query()->create([
                'journal_entry_id' => $je->id,
                'account_id' => $ar->id,
                'debit' => $total,
                'credit' => 0,
                'description' => 'AR',
            ]);
            AccJournalLine::query()->create([
                'journal_entry_id' => $je->id,
                'account_id' => $rev->id,
                'debit' => 0,
                'credit' => $total,
                'description' => 'Revenue',
            ]);
            $inv->update(['status' => 'posted']);
        });

        return response()->json(['data' => $inv->fresh()]);
    }
}
