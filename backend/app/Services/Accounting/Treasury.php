<?php

namespace App\Services\Accounting;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Where the money actually is, and where it is going.
 *
 * `acc_cash_accounts` listed the shop's drawers, banks and terminals but never said what was in
 * them — the list was a phone book, not a balance sheet. A balance is a derivation, not a
 * column: it is the drawer's chart account in the ledger, which means it cannot drift from the
 * books and needs no reconciliation to stay true.
 *
 * The forecast is deliberately narrow. It counts what is *known* — cheques with a due date and
 * supplier bills with a due date — and says so. A cash-flow projection that invents expected
 * walk-in sales is a number nobody can act on and everybody eventually mistrusts.
 */
final class Treasury
{
    public function __construct(private readonly AccountCoding $coding) {}

    /**
     * Every cash and bank account with its live balance.
     *
     * @return list<array<string, mixed>>
     */
    public function accounts(int $tenantId): array
    {
        $roles = $this->coding->get($tenantId)['roles'];

        $accounts = DB::table('acc_cash_accounts')
            ->where('tenant_id', $tenantId)
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        $balances = $this->balanceByCode($tenantId);

        return $accounts->map(function ($account) use ($roles, $balances): array {
            $code = trim((string) ($account->chart_code ?? ''));

            if ($code === '') {
                // An account that has never been mapped falls back to the role its type implies,
                // so a shop that just added a drawer sees a number rather than a blank.
                $code = (string) ($account->type === 'cash'
                    ? ($roles['cash'] ?? '1102')
                    : ($roles['bank'] ?? '1103'));
            }

            return [
                'id' => (int) $account->id,
                'name' => $account->name,
                'type' => $account->type,
                'chart_code' => $code,
                'bank_name' => $account->bank_name,
                'is_default' => (bool) $account->is_default,
                'is_active' => (bool) ($account->is_active ?? true),
                'balance_minor' => round($balances[$code] ?? 0.0, 2),
            ];
        })->values()->all();
    }

    /**
     * Cash movement for a period: opening, in, out, closing.
     *
     * Opening is "the balance before the first day", not "the closing balance minus this
     * period's flows" — those differ whenever a document was backdated, and the difference is
     * exactly what a treasurer wants to see rather than have smoothed away.
     *
     * @return array<string, mixed>
     */
    public function cashFlow(int $tenantId, Carbon $from, Carbon $to): array
    {
        $roles = $this->coding->get($tenantId)['roles'];
        $codes = array_values(array_unique(array_filter([
            (string) ($roles['cash'] ?? '1102'),
            (string) ($roles['bank'] ?? '1103'),
        ])));

        $sum = fn (Carbon $a, Carbon $b, string $side): float => (float) DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->where('je.tenant_id', $tenantId)
            ->whereIn('a.code', $codes)
            ->whereIn('je.status', ['posted', 'confirmed'])
            ->where('je.document_date', '<', $a->toDateString())
            ->selectRaw($side === 'debit'
                ? 'COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) as v'
                : 'COALESCE(SUM(jl.credit),0) - COALESCE(SUM(jl.debit),0) as v')
            ->value('v');

        $opening = $sum($from, $to, 'debit');

        $period = DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->where('je.tenant_id', $tenantId)
            ->whereIn('a.code', $codes)
            ->whereIn('je.status', ['posted', 'confirmed'])
            ->whereBetween('je.document_date', [$from->toDateString(), $to->toDateString()])
            ->selectRaw('COALESCE(SUM(jl.debit),0) as inflow')
            ->selectRaw('COALESCE(SUM(jl.credit),0) as outflow')
            ->first();

        $inflow = (float) ($period->inflow ?? 0);
        $outflow = (float) ($period->outflow ?? 0);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'opening_minor' => round($opening, 2),
            'inflow_minor' => round($inflow, 2),
            'outflow_minor' => round($outflow, 2),
            'net_minor' => round($inflow - $outflow, 2),
            'closing_minor' => round($opening + $inflow - $outflow, 2),
        ];
    }

    /**
     * What is due out of the bank, week by week.
     *
     * Cheques and supplier bills carry a date, which is the only reason a forecast is possible
     * at all. Nothing here guesses at future sales.
     *
     * @return array<string, mixed>
     */
    public function dueForecast(int $tenantId, int $weeks = 6): array
    {
        $today = now()->startOfDay();
        $weeks = max(1, min(26, $weeks));

        $buckets = [];

        for ($i = 0; $i < $weeks; $i++) {
            $start = $today->copy()->addWeeks($i);
            $end = $start->copy()->addDays(6);
            $buckets[] = [
                'from' => $start->toDateString(),
                'to' => $end->toDateString(),
                'cheques_minor' => 0.0,
                'bills_minor' => 0.0,
                'total_minor' => 0.0,
            ];
        }

        $overdue = ['cheques_minor' => 0.0, 'bills_minor' => 0.0];

        $place = function (string $date, float $amount, string $kind) use (&$buckets, &$overdue, $today): void {
            if ($date < $today->toDateString()) {
                $overdue[$kind] += $amount;

                return;
            }

            foreach ($buckets as $index => $bucket) {
                if ($date >= $bucket['from'] && $date <= $bucket['to']) {
                    $buckets[$index][$kind] += $amount;
                    $buckets[$index]['total_minor'] += $amount;

                    return;
                }
            }
        };

        // A payable cheque: `type = payable` and not yet cleared.
        $cheques = DB::table('acc_checks')
            ->where('tenant_id', $tenantId)
            ->where('type', 'payable')
            ->whereIn('status', ['pending', 'in_progress'])
            ->whereNotNull('due_date')
            ->get(['due_date', 'amount']);

        foreach ($cheques as $cheque) {
            $place((string) $cheque->due_date, (float) $cheque->amount, 'cheques_minor');
        }

        $bills = DB::table('supplier_invoices')
            ->where('tenant_id', $tenantId)
            ->where('status', 'open')
            ->whereNotNull('due_on')
            ->get(['due_on', 'total_minor', 'paid_minor']);

        foreach ($bills as $bill) {
            $place((string) $bill->due_on, (float) $bill->total_minor - (float) $bill->paid_minor, 'bills_minor');
        }

        return [
            'weeks' => $buckets,
            'overdue' => [
                'cheques_minor' => round($overdue['cheques_minor'], 2),
                'bills_minor' => round($overdue['bills_minor'], 2),
                'total_minor' => round($overdue['cheques_minor'] + $overdue['bills_minor'], 2),
            ],
            'total_minor' => round(array_sum(array_column($buckets, 'total_minor')), 2),
            // Said plainly in the payload so no screen has to remember it.
            'scope' => 'known_commitments_only',
        ];
    }

    /** @return array<string, float> chart code → debit-positive balance, as of now. */
    private function balanceByCode(int $tenantId): array
    {
        return DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->where('je.tenant_id', $tenantId)
            ->whereIn('je.status', ['posted', 'confirmed'])
            ->groupBy('a.code')
            ->selectRaw('a.code as code')
            ->selectRaw('COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) as bal')
            ->pluck('bal', 'code')
            ->map(fn ($value): float => (float) $value)
            ->all();
    }
}
