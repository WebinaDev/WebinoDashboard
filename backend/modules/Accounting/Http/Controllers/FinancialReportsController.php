<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Support\AccountingQuery;

class FinancialReportsController extends Controller
{
    public function financialReports(Request $request): JsonResponse
    {
        $request->validate([
            'type' => 'nullable|in:trial_balance,balance_sheet,profit_loss',
            'from' => 'nullable|date',
            'to' => 'nullable|date',
        ]);

        $type = $request->input('type', 'trial_balance');

        $base = AccountingQuery::journalLines()
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->select([
                'a.id as account_id',
                'a.code',
                'a.name',
                'a.type',
                DB::raw('SUM(jl.debit) as sum_debit'),
                DB::raw('SUM(jl.credit) as sum_credit'),
            ])
            ->groupBy('a.id', 'a.code', 'a.name', 'a.type');

        if ($request->filled('from')) {
            $base->whereDate('je.document_date', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $base->whereDate('je.document_date', '<=', $request->input('to'));
        }

        $rows = $base->get()->map(function ($r) {
            $balance = (float) $r->sum_debit - (float) $r->sum_credit;

            return [
                'account_id' => $r->account_id,
                'code' => $r->code,
                'name' => $r->name,
                'type' => $r->type,
                'debit' => (float) $r->sum_debit,
                'credit' => (float) $r->sum_credit,
                'balance' => $balance,
            ];
        });

        if ($type === 'balance_sheet') {
            $assets = $rows->filter(fn ($r) => str_contains(strtolower($r['type']), 'asset'));
            // Liabilities + equity together: a balance sheet without equity never
            // balances, and the chart seeds equity as its own type ('equity').
            $liab = $rows->filter(fn ($r) => str_contains(strtolower($r['type']), 'liabilit')
                || str_contains(strtolower($r['type']), 'payable')
                || str_contains(strtolower($r['type']), 'equity'));

            return response()->json([
                'data' => [
                    'type' => $type,
                    'assets' => $assets->values(),
                    'liabilities_equity' => $liab->values(),
                ],
            ]);
        }

        if ($type === 'profit_loss') {
            $pl = $rows->filter(fn ($r) => str_contains(strtolower($r['type']), 'revenue')
                || str_contains(strtolower($r['type']), 'expense')
                || str_contains(strtolower($r['type']), 'cost'));

            return response()->json([
                'data' => [
                    'type' => $type,
                    'rows' => $pl->values(),
                ],
            ]);
        }

        return response()->json([
            'data' => [
                'type' => 'trial_balance',
                'rows' => $rows->values(),
            ],
        ]);
    }
}
