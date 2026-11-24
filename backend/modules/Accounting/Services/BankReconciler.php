<?php

namespace Modules\Accounting\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Bank reconciliation with the book, over a real statement.
 *
 * `BankReconciliationService` has existed for months and matched nothing, ever: it takes two
 * arrays and returns a match report, and no route, screen or caller ever handed it one. This
 * class is the missing half — it reads the shop's side out of the ledger for a date range, so
 * the engine finally has something to reconcile against.
 *
 * The two rules that make the output trustworthy:
 *
 *  - **Only the bank's own chart account is read.** Reconciling every journal line against the
 *    statement would "match" a bank deposit to a cash sale of the same amount and report a
 *    clean month that never balanced.
 *  - **The book is signed the way a statement is signed.** A statement says "money in / money
 *    out"; the ledger says debit / credit. A debit on a bank account is money in, so the sign
 *    is flipped once, here, rather than in each caller's head.
 *
 * The statement parser accepts the shape a real bank exports: a date and an amount is enough;
 * a reference and a description are used when present. Persian and Arabic digits, `٬`/`,`/` `
 * as thousands separators, a parenthesised negative and a trailing `-` are all read, because a
 * shop's first CSV is always the one its bank made.
 */
final class BankReconciler
{
    public function __construct(private readonly BankReconciliationService $engine) {}

    /** Statuses that are money that has actually moved. */
    private const POSTED = ['posted', 'confirmed'];

    /**
     * The book side: every posted journal line on the account, as statement rows.
     *
     * @return array{rows: list<array<string, mixed>>, account: array<string, mixed>|null, opening_balance: float}
     */
    public function bookSide(int $tenantId, int $cashAccountId, Carbon $from, Carbon $to): array
    {
        $account = DB::table('acc_cash_accounts')
            ->where('tenant_id', $tenantId)
            ->where('id', $cashAccountId)
            ->first();

        if ($account === null) {
            return ['rows' => [], 'account' => null, 'opening_balance' => 0.0];
        }

        $code = trim((string) ($account->chart_code ?? ''));

        if ($code === '') {
            // Without a chart account there is nothing to reconcile against. An empty list would
            // read as "the book is empty"; the caller gets nulls and the screen explains why.
            return ['rows' => [], 'account' => (array) $account, 'opening_balance' => 0.0];
        }

        $chartId = DB::table('acc_chart_accounts')
            ->where('tenant_id', $tenantId)
            ->where('code', $code)
            ->value('id');

        if ($chartId === null) {
            return ['rows' => [], 'account' => (array) $account, 'opening_balance' => 0.0];
        }

        // Everything before the window is the statement's opening balance, so the closing figure
        // the shop compares with the bank agrees with the trial balance.
        $opening = (float) (DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->where('jl.tenant_id', $tenantId)
            ->where('jl.account_id', $chartId)
            ->whereIn('je.status', self::POSTED)
            ->where('je.document_date', '<', $from->toDateString())
            ->selectRaw('COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) as balance')
            ->value('balance') ?? 0);

        $lines = DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->where('jl.tenant_id', $tenantId)
            ->where('jl.account_id', $chartId)
            ->whereIn('je.status', self::POSTED)
            ->whereBetween('je.document_date', [$from->toDateString(), $to->toDateString()])
            ->orderBy('je.document_date')
            ->orderBy('je.id')
            ->get([
                'jl.id',
                'jl.debit',
                'jl.credit',
                'jl.description',
                'je.document_date',
                'je.document_no',
                'je.description as entry_description',
            ]);

        $rows = [];

        foreach ($lines as $line) {
            $debit = (float) $line->debit;
            $credit = (float) $line->credit;
            $net = $debit - $credit;

            // A debit on a bank account is money in. The statement calls that a credit.
            $rows[] = [
                'id' => 'jl-'.$line->id,
                'date' => (string) $line->document_date,
                'amount' => round(abs($net), 2),
                'type' => $net >= 0 ? 'credit' : 'debit',
                // The voucher number is what a shop writes on the bank slip; it is the best
                // reference the book has, and it is usually what the statement quotes back.
                'reference_no' => $line->document_no !== null && trim((string) $line->document_no) !== ''
                    ? trim((string) $line->document_no)
                    : null,
                'description' => trim((string) ($line->description ?? $line->entry_description ?? '')) ?: null,
            ];
        }

        return ['rows' => $rows, 'account' => (array) $account, 'opening_balance' => round($opening, 2)];
    }

    /**
     * Parse a bank statement export into rows the engine understands.
     *
     * The header is sniffed rather than required in a fixed order, because every bank names its
     * columns differently: تاریخ/date, مبلغ/amount/credit/debit, شرح/description.
     *
     * @return array{rows: list<array<string, mixed>>, columns: array<string, string>, skipped: list<array{line: int, reason: string}>}
     */
    public function parseStatement(string $content): array
    {
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content) ?? $content;
        $content = str_replace(["\r\n", "\r"], "\n", $content);

        $lines = array_values(array_filter(explode("\n", $content), fn (string $l): bool => trim($l) !== ''));

        if ($lines === []) {
            return ['rows' => [], 'columns' => [], 'skipped' => []];
        }

        $delimiter = $this->sniff($lines[0]);

        $header = array_map(fn (string $h): string => $this->normalizeHeader($h), str_getcsv($lines[0], $delimiter));
        $columns = $this->mapColumns($header);

        $rows = [];
        $skipped = [];

        foreach (array_slice($lines, 1) as $index => $line) {
            $lineNo = $index + 2; // sheet rows are 1-based and the header is row 1
            $cells = str_getcsv($line, $delimiter);

            $date = isset($columns['date']) ? $this->parseDate($cells[$columns['date']] ?? '') : null;

            if ($date === null) {
                $skipped[] = ['line' => $lineNo, 'reason' => 'date'];

                continue;
            }

            // A single signed amount column beats separate debit/credit columns when both exist,
            // because the signed column already knows the direction.
            $amount = null;
            $type = null;

            if (isset($columns['amount'])) {
                $amount = $this->parseMoney($cells[$columns['amount']] ?? '');
                $type = $amount === null ? null : ($amount >= 0 ? 'credit' : 'debit');
                $amount = $amount === null ? null : abs($amount);
            } elseif (isset($columns['credit']) || isset($columns['debit'])) {
                $credit = isset($columns['credit']) ? $this->parseMoney($cells[$columns['credit']] ?? '') : null;
                $debit = isset($columns['debit']) ? $this->parseMoney($cells[$columns['debit']] ?? '') : null;

                if ($credit !== null && abs($credit) > 0) {
                    $amount = abs($credit);
                    $type = 'credit';
                } elseif ($debit !== null && abs($debit) > 0) {
                    $amount = abs($debit);
                    $type = 'debit';
                }
            }

            if ($amount === null || $amount <= 0 || $type === null) {
                $skipped[] = ['line' => $lineNo, 'reason' => 'amount'];

                continue;
            }

            $rows[] = [
                'id' => (string) (isset($columns['reference']) ? trim((string) ($cells[$columns['reference']] ?? '')) : ''),
                'date' => $date,
                'amount' => round($amount, 2),
                'type' => $type,
                'reference_no' => isset($columns['reference']) ? trim((string) ($cells[$columns['reference']] ?? '')) ?: null : null,
                'description' => isset($columns['description']) ? trim((string) ($cells[$columns['description']] ?? '')) ?: null : null,
            ];
        }

        return ['rows' => $rows, 'columns' => $columns, 'skipped' => $skipped];
    }

    /**
     * Reconcile a parsed statement against the book for an account and window.
     *
     * @return array<string, mixed>
     */
    public function reconcile(int $tenantId, int $cashAccountId, Carbon $from, Carbon $to, string $content): array
    {
        $book = $this->bookSide($tenantId, $cashAccountId, $from, $to);
        $statement = $this->parseStatement($content);

        $result = $this->engine->reconcile($statement['rows'], $book['rows']);

        $statementTotal = array_sum(array_map(
            fn (array $row): float => $row['type'] === 'credit' ? $row['amount'] : -$row['amount'],
            $statement['rows'],
        ));

        $bookTotal = array_sum(array_map(
            fn (array $row): float => $row['type'] === 'credit' ? $row['amount'] : -$row['amount'],
            $book['rows'],
        ));

        return array_merge($result, [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'cash_account_id' => $cashAccountId,
            'account' => $book['account'],
            'columns' => $statement['columns'],
            'skipped_rows' => $statement['skipped'],
            'opening_balance' => $book['opening_balance'],
            'gaps' => [
                'statement_net' => round($statementTotal, 2),
                'book_net' => round($bookTotal, 2),
                // The number the accountant is really looking for: what the two records disagree
                // by. Zero here means the month reconciles, whatever the matched counts say.
                'net_difference' => round($statementTotal - $bookTotal, 2),
                'closing_balance' => round($book['opening_balance'] + $bookTotal, 2),
            ],
        ]);
    }

    /** Tab, semicolon, or comma — whichever the header uses most. */
    private function sniff(string $header): string
    {
        $best = ',';
        $bestCount = 0;

        foreach ([",", ";", "\t"] as $candidate) {
            $count = substr_count($header, $candidate);
            if ($count > $bestCount) {
                $best = $candidate;
                $bestCount = $count;
            }
        }

        return $best;
    }

    private function normalizeHeader(string $header): string
    {
        return mb_strtolower(trim(str_replace(['"', "'", '‌'], '', $header)));
    }

    /**
     * @param  list<string>  $header
     * @return array<string, int>
     */
    private function mapColumns(array $header): array
    {
        $aliases = [
            'date' => ['date', 'تاریخ', 'تاریخ تراکنش', 'تاریخ عملیات', 'روز', 'transaction date', 'value date'],
            'amount' => ['amount', 'مبلغ', 'مبلغ تراکنش', 'مبلغ (ریال)', 'مبلغ (تومان)', 'value', 'transaction amount'],
            'credit' => ['credit', 'بستانکار', 'واریز', 'واریزی', 'deposit'],
            'debit' => ['debit', 'بدهکار', 'برداشت', 'برداشتی', 'withdrawal'],
            'reference' => ['reference', 'reference_no', 'ref', 'شماره پیگیری', 'شماره سند', 'کد پیگیری', 'شماره تراکنش'],
            'description' => ['description', 'شرح', 'توضیحات', 'بیان', 'detail', 'narrative'],
        ];

        $map = [];

        foreach ($aliases as $key => $names) {
            foreach ($header as $index => $cell) {
                foreach ($names as $name) {
                    if ($cell === $name || str_contains($cell, $name)) {
                        $map[$key] ??= $index;
                    }
                }
            }
        }

        return $map;
    }

    /** `1403/09/02`, `2024-11-22`, or `22/11/2024`. Jalali is not converted here; the date is kept as text. */
    private function parseDate(string $raw): ?string
    {
        $value = trim(str_replace(['"', "'"], '', $raw));

        if ($value === '') {
            return null;
        }

        $value = strtr($value, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);

        $value = str_replace(['/', '.'], '-', $value);

        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $value, $m) === 1) {
            return sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3]);
        }

        if (preg_match('/^(\d{1,2})-(\d{1,2})-(\d{4})/', $value, $m) === 1) {
            return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
        }

        return null;
    }

    /** `1,250,000`, `۱٬۲۵۰٬۰۰۰`, `(250000)`, `250000-`. Returns a signed float. */
    private function parseMoney(string $raw): ?float
    {
        $value = trim(str_replace(['"', "'", ' ', '‌', '٬', ',', '،', 'ریال', 'تومان'], '', $raw));

        if ($value === '') {
            return null;
        }

        $value = strtr($value, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);

        $negative = false;

        if (str_starts_with($value, '(') && str_ends_with($value, ')')) {
            $negative = true;
            $value = trim($value, '()');
        }

        if (str_ends_with($value, '-')) {
            $negative = true;
            $value = rtrim($value, '-');
        }

        if (! is_numeric($value)) {
            return null;
        }

        $number = (float) $value;

        return $negative ? -abs($number) : $number;
    }
}
