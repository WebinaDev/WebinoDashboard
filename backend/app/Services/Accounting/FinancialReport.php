<?php

namespace App\Services\Accounting;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Support\AccountingQuery;

/**
 * Trial balance, balance sheet and profit & loss — as data, so a screen, a CSV and a print view
 * can all be the same report.
 *
 * This lived inside the controller, which meant the only thing you could do with a trial balance
 * was look at it. An accountant needs the file: the month-end pack goes to an auditor, a bank, or
 * an office that has never heard of this application. Two decisions here:
 *
 *  - **The CSV is the same rows the screen shows**, generated from the same method, so a total
 *    that disagrees between paper and screen is impossible rather than unlikely.
 *  - **The file starts with a BOM and is UTF-8.** Excel on a Persian Windows machine reads a
 *    BOM-less UTF-8 file as the local codepage and turns every account name into mojibake, which
 *    is the single most common complaint about "the export doesn't work".
 */
final class FinancialReport
{
    public const TYPES = ['trial_balance', 'balance_sheet', 'profit_loss'];

    /**
     * @return array<string, mixed>
     */
    public function build(Request $request): array
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

        $type = (string) $request->input('type', 'trial_balance');

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
        })->sortBy('code')->values();

        $meta = [
            'from' => $request->input('from'),
            'to' => $request->input('to'),
            'branch_id' => $request->filled('branch_id') ? (int) $request->input('branch_id') : null,
            'include_unassigned' => $request->boolean('include_unassigned'),
        ];

        if ($type === 'balance_sheet') {
            return [
                'type' => $type,
                'meta' => $meta,
                'assets' => $rows->filter(fn ($r) => str_contains(strtolower((string) $r['type']), 'asset'))->values(),
                'liabilities_equity' => $rows->filter(fn ($r) => str_contains(strtolower((string) $r['type']), 'liabilit')
                    || str_contains(strtolower((string) $r['type']), 'payable'))->values(),
            ];
        }

        if ($type === 'profit_loss') {
            $pl = $rows->filter(fn ($r) => str_contains(strtolower((string) $r['type']), 'revenue')
                || str_contains(strtolower((string) $r['type']), 'expense')
                || str_contains(strtolower((string) $r['type']), 'cost'));

            // Signed so a report can print "profit 4,200,000" instead of making the reader
            // subtract two big numbers in their head and get the sign right themselves.
            $revenue = round((float) $pl->filter(fn ($r) => str_contains(strtolower((string) $r['type']), 'revenue'))->sum(fn ($r) => -$r['balance']), 2);
            $expense = round((float) $pl->filter(fn ($r) => ! str_contains(strtolower((string) $r['type']), 'revenue'))->sum(fn ($r) => $r['balance']), 2);

            return [
                'type' => $type,
                'meta' => $meta,
                'rows' => $pl->values(),
                'totals' => [
                    'revenue' => $revenue,
                    'expense' => $expense,
                    'profit' => round($revenue - $expense, 2),
                ],
            ];
        }

        return [
            'type' => 'trial_balance',
            'meta' => $meta,
            'rows' => $rows,
            'totals' => [
                'debit' => round((float) $rows->sum('debit'), 2),
                'credit' => round((float) $rows->sum('credit'), 2),
                // If this is not zero the books are broken, and the report is the only place
                // that says so out loud.
                'difference' => round((float) $rows->sum('debit') - (float) $rows->sum('credit'), 2),
            ],
        ];
    }

    /** The flat view of any report type: what a CSV or a print sheet needs. */
    public function toCsv(array $report): string
    {
        $rows = [];

        $rows[] = [$this->label((string) $report['type'])];
        $rows[] = ['از / From', $report['meta']['from'] ?? ''];
        $rows[] = ['تا / To', $report['meta']['to'] ?? ''];
        if (($report['meta']['branch_id'] ?? null) !== null) {
            $rows[] = ['شعبه / Branch', $report['meta']['branch_id']];
        }
        $rows[] = [];

        $rows[] = ['کد', 'نام حساب', 'نوع', 'بدهکار', 'بستانکار', 'مانده'];

        foreach ($this->flatRows($report) as $row) {
            $rows[] = [
                $row['code'],
                $row['name'],
                $row['type'],
                $row['debit'],
                $row['credit'],
                $row['balance'],
            ];
        }

        if (isset($report['totals'])) {
            $rows[] = [];
            foreach ($report['totals'] as $key => $value) {
                $rows[] = [$this->label((string) $key), '', '', '', '', $value];
            }
        }

        $out = "\xEF\xBB\xBF"; // BOM: Excel needs it to read Persian as UTF-8.
        foreach ($rows as $line) {
            $out .= implode(',', array_map([$this, 'cell'], $line))."\r\n";
        }

        return $out;
    }

    /**
     * @return list<array{code: mixed, name: mixed, type: mixed, debit: float, credit: float, balance: float}>
     */
    private function flatRows(array $report): array
    {
        if ($report['type'] === 'balance_sheet') {
            $out = [];
            foreach (['assets', 'liabilities_equity'] as $group) {
                foreach ($report[$group] as $row) {
                    $out[] = [
                        'code' => $row['code'],
                        'name' => (string) $row['name'],
                        'type' => (string) $row['type'],
                        'debit' => (float) $row['debit'],
                        'credit' => (float) $row['credit'],
                        'balance' => (float) $row['balance'],
                    ];
                }
            }

            return $out;
        }

        return array_map(fn (array $row): array => [
            'code' => $row['code'],
            'name' => (string) $row['name'],
            'type' => (string) $row['type'],
            'debit' => (float) $row['debit'],
            'credit' => (float) $row['credit'],
            'balance' => (float) $row['balance'],
        ], $report['rows'] ?? []);
    }

    /**
     * One CSV cell.
     *
     * A leading =, +, - or @ makes Excel treat the value as a formula. Account names come from
     * user input, so a name starting with "=" would execute; prefixing a tab defuses it without
     * changing what a human reads.
     */
    private function cell(mixed $value): string
    {
        $text = (string) $value;

        if ($text !== '' && in_array($text[0], ['=', '+', '-', '@'], true) && ! is_numeric($text)) {
            $text = "\t".$text;
        }

        return '"'.str_replace('"', '""', $text).'"';
    }

    private function label(string $key): string
    {
        return match ($key) {
            'trial_balance' => 'تراز آزمایشی',
            'balance_sheet' => 'ترازنامه',
            'profit_loss' => 'سود و زیان',
            'debit' => 'جمع بدهکار',
            'credit' => 'جمع بستانکار',
            'difference' => 'اختلاف',
            'revenue' => 'درآمد',
            'expense' => 'هزینه',
            'profit' => 'سود',
            default => $key,
        };
    }
}
