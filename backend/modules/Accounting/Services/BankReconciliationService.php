<?php

namespace Modules\Accounting\Services;

/**
 * Automated Bank Reconciliation Engine.
 * Matches bank statement transactions against internal GL ledger entries by date, amount, and reference/trace numbers.
 */
class BankReconciliationService
{
    /**
     * Run reconciliation match between bank statement rows and GL ledger entries.
     *
     * @param  list<array{id: string|int, date: string, amount: float, type: 'credit'|'debit', reference_no: string|null, description: string|null}>  $bankStatementRows
     * @param  list<array{id: string|int, date: string, amount: float, type: 'credit'|'debit', reference_no: string|null, description: string|null}>  $glLedgerRows
     * @return array<string, mixed>
     */
    public function reconcile(array $bankStatementRows, array $glLedgerRows): array
    {
        $matched = [];
        $unmatchedBank = [];
        $unmatchedLedger = $glLedgerRows;

        foreach ($bankStatementRows as $bankRow) {
            $foundIndex = null;
            $bankAmount = round((float) $bankRow['amount'], 2);
            $bankRef = trim((string) ($bankRow['reference_no'] ?? ''));

            foreach ($unmatchedLedger as $idx => $ledgerRow) {
                $ledgerAmount = round((float) $ledgerRow['amount'], 2);
                $ledgerRef = trim((string) ($ledgerRow['reference_no'] ?? ''));

                // 1. تطبیق کامل با شماره پیگیری/مرجع و مبلغ یکسان
                $exactRefMatch = ($bankRef !== '' && $ledgerRef !== '' && $bankRef === $ledgerRef && $bankAmount === $ledgerAmount);

                // 2. تطبیق با تاریخ و مبلغ یکسان در صورت نبود شماره پیگیری
                $dateMatch = ($bankRow['date'] === $ledgerRow['date'] && $bankAmount === $ledgerAmount && $bankRow['type'] === $ledgerRow['type']);

                if ($exactRefMatch || $dateMatch) {
                    $foundIndex = $idx;
                    $matched[] = [
                        'bank_row' => $bankRow,
                        'ledger_row' => $ledgerRow,
                        'match_type' => $exactRefMatch ? 'EXACT_REFERENCE' : 'DATE_AND_AMOUNT',
                        'matched_amount' => $bankAmount,
                    ];
                    break;
                }
            }

            if ($foundIndex !== null) {
                unset($unmatchedLedger[$foundIndex]);
                $unmatchedLedger = array_values($unmatchedLedger);
            } else {
                $unmatchedBank[] = $bankRow;
            }
        }

        $totalBankMatched = array_sum(array_column($matched, 'matched_amount'));
        $totalBankDiscrepancy = array_sum(array_column($unmatchedBank, 'amount'));
        $totalLedgerDiscrepancy = array_sum(array_column($unmatchedLedger, 'amount'));

        return [
            'summary' => [
                'total_bank_records' => count($bankStatementRows),
                'total_ledger_records' => count($glLedgerRows),
                'matched_count' => count($matched),
                'unmatched_bank_count' => count($unmatchedBank),
                'unmatched_ledger_count' => count($unmatchedLedger),
                'reconciliation_rate_percent' => count($bankStatementRows) > 0
                    ? round((count($matched) / count($bankStatementRows)) * 100, 2)
                    : 100.0,
                'total_matched_amount' => $totalBankMatched,
                'bank_open_discrepancy' => $totalBankDiscrepancy,
                'ledger_in_transit_discrepancy' => $totalLedgerDiscrepancy,
            ],
            'matched' => $matched,
            'unmatched_bank_records' => $unmatchedBank,
            'unmatched_ledger_records' => $unmatchedLedger,
            'reconciled_at' => now()->toIso8601String(),
        ];
    }
}
