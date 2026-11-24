<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\AccCashAccount;
use Modules\Accounting\Support\AccountingQuery;

/**
 * The shop's money accounts — drawer, petty cash, bank, card terminal, payment gateway.
 *
 * The list used to show name/IBAN and nothing else, which made the screen a phone book: a
 * manager could not answer "how much is in this drawer right now" without opening the ledger
 * and finding the account by hand. Each row now carries a balance derived from the journals
 * that touched its chart account, so the balance is one query and always agrees with the
 * trial balance by construction.
 */
class CashAccountController extends Controller
{
    public function cashAccounts(Request $request): JsonResponse
    {
        $request->validate([
            'type' => 'nullable|string|max:30',
            'active_only' => 'nullable|boolean',
        ]);

        $page = AccCashAccount::query()
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true))
            ->orderBy('name')
            ->paginate(min((int) $request->input('per_page', 50), 100));

        $balances = $this->balancesFor(
            $page->getCollection()->pluck('chart_code')->filter()->unique()->all(),
        );

        $page->getCollection()->transform(function (AccCashAccount $account) use ($balances): AccCashAccount {
            $code = (string) ($account->chart_code ?? '');
            $account->setAttribute('balance', $balances[$code] ?? 0.0);
            // A row with no chart account cannot be reconciled; say so rather than showing
            // a confident zero that is really "unknown".
            $account->setAttribute('balance_known', $code !== '' && array_key_exists($code, $balances));

            return $account;
        });

        return response()->json(['data' => $page]);
    }

    /**
     * Debit-minus-credit per chart code, as a map.
     *
     * One grouped query for the whole page rather than a query per row: fifty accounts each
     * summing the ledger is how a list screen ends up slower than the report it replaced.
     *
     * @param  list<string>  $codes
     * @return array<string, float>
     */
    private function balancesFor(array $codes): array
    {
        if ($codes === []) {
            return [];
        }

        $rows = AccountingQuery::journalLines()
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            // A draft journal is not money yet; only posted documents move a balance.
            ->where(function ($w): void {
                $w->where('je.status', 'posted')->orWhereNull('je.status');
            })
            ->whereIn('a.code', $codes)
            ->groupBy('a.code')
            ->select([
                'a.code',
                DB::raw('SUM(jl.debit) as total_debit'),
                DB::raw('SUM(jl.credit) as total_credit'),
            ])
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row->code] = round((float) $row->total_debit - (float) $row->total_credit, 2);
        }

        return $out;
    }
}
