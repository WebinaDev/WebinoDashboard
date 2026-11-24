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
            // Three branches in one panel used to share one P&L, which is enough to run one
            // café and useless for running three.
            'branch_id' => 'nullable|integer',
            // Entries posted by a document with no branch (head office, a manual journal) are
            // reported as unassigned rather than quietly filed under the first branch.
            'include_unassigned' => 'nullable|boolean',
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
        if ($request->filled('branch_id')) {
            $branchId = (int) $request->input('branch_id');

            $base->where(function ($q) use ($branchId, $request): void {
                $q->where('je.branch_id', $branchId);

                // "All branches plus the head-office entries" is a real question; the default
                // is a strict filter, because summing unassigned costs into one branch's P&L
                // is the way a branch suddenly looks unprofitable.
                if ($request->boolean('include_unassigned')) {
                    $q->orWhereNull('je.branch_id');
                }
            });
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
            $liab = $rows->filter(fn ($r) => str_contains(strtolower($r['type']), 'liabilit') || str_contains(strtolower($r['type']), 'payable'));

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
