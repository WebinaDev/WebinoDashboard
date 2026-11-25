<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Modules\Accounting\Entities\AccFiscalYear;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccountingInvoice;
use Modules\Accounting\Entities\AccountingSetting;
use Modules\Accounting\Entities\AccPerson;
use Modules\Accounting\Entities\AccWarehouse;
use Modules\Accounting\Entities\AccWarehouseStock;
use Modules\Accounting\Support\AccountingQuery;

class AccountingDashboardController extends Controller
{
    public function summary(): JsonResponse
    {
        $fiscalYearId = AccountingSetting::get('accounting_default_fiscal_year_id');
        $fiscalYear = $fiscalYearId
            ? AccFiscalYear::query()->find($fiscalYearId)
            : AccFiscalYear::query()->orderByDesc('starts_on')->first();

        $totals = AccountingQuery::journalLines()
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->selectRaw('COALESCE(SUM(jl.debit), 0) as total_debit, COALESCE(SUM(jl.credit), 0) as total_credit')
            ->when($fiscalYear, fn ($q) => $q->where('je.fiscal_year_id', $fiscalYear->id))
            ->first();

        $lowStock = AccWarehouseStock::query()
            ->with(['product', 'warehouse'])
            ->whereNotNull('reorder_point')
            ->whereColumn('quantity', '<=', 'reorder_point')
            ->limit(10)
            ->get();

        return response()->json([
            'data' => [
                'fiscal_years_count' => AccFiscalYear::query()->count(),
                'journal_entries_count' => AccJournalEntry::query()->count(),
                'draft_journals_count' => AccJournalEntry::query()->where('status', 'draft')->count(),
                'persons_count' => AccPerson::query()->count(),
                'invoices_count' => AccountingInvoice::query()->count(),
                'warehouses_count' => AccWarehouse::query()->count(),
                'current_fiscal_year' => $fiscalYear,
                'total_debit' => (float) ($totals->total_debit ?? 0),
                'total_credit' => (float) ($totals->total_credit ?? 0),
                'low_stock' => $lowStock,
            ],
        ]);
    }
}
