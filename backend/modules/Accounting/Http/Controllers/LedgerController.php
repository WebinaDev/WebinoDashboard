<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Support\AccountingQuery;
use Modules\Accounting\Support\ExistsForTenant;

class LedgerController extends Controller
{
    public function ledger(Request $request): JsonResponse
    {
        $request->validate([
            'account_id' => ['nullable', ExistsForTenant::in('acc_chart_accounts')],
            'from' => 'nullable|date',
            'to' => 'nullable|date|after_or_equal:from',
        ]);

        $q = AccountingQuery::journalLines()
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->select([
                'jl.id',
                'jl.journal_entry_id',
                'je.document_no',
                'je.document_date',
                'jl.account_id',
                'a.code as account_code',
                'a.name as account_name',
                'jl.debit',
                'jl.credit',
                'jl.description as line_description',
                'je.description as entry_description',
            ])
            ->orderBy('je.document_date')
            ->orderBy('jl.id');

        if ($request->filled('account_id')) {
            $q->where('jl.account_id', $request->input('account_id'));
        }
        if ($request->filled('from')) {
            $q->whereDate('je.document_date', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $q->whereDate('je.document_date', '<=', $request->input('to'));
        }

        $lines = $q->get();
        $totals = [
            'debit' => (float) $lines->sum('debit'),
            'credit' => (float) $lines->sum('credit'),
        ];

        return response()->json([
            'data' => [
                'lines' => $lines,
                'totals' => $totals,
            ],
        ]);
    }
}
