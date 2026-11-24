<?php

namespace App\Services\Accounting;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * What a person owes, and what they are allowed to owe.
 *
 * `acc_journal_lines` has no `person_id`: the chart of accounts knows that 1,240,000 sits in
 * receivables, but not whose. A shop therefore could not produce the one document every
 * customer eventually asks for — a statement of their account — and could not enforce a credit
 * limit, because there was nothing to enforce it against per person.
 *
 * Rather than add a person column to every journal line (and rewrite eleven ledger-writing
 * services), the party balance is derived from the two documents that already name a person:
 * invoices (they owe us) and their own reference on the ledger. That is the accounting
 * definition — a statement of account is the sum of the documents, not a separate number — and
 * it means the statement and the AR aging report can never disagree.
 */
final class PartyLedger
{
    /**
     * Current balance for one party. Positive = they owe the shop; negative = the shop owes them.
     */
    public function balance(int $tenantId, int $personId): float
    {
        $invoiced = (float) DB::table('acc_invoices')
            ->where('tenant_id', $tenantId)
            ->where('person_id', $personId)
            ->whereIn('status', ['confirmed', 'posted'])
            ->sum('total');

        $received = (float) DB::table('acc_receipt_vouchers')
            ->where('tenant_id', $tenantId)
            ->where('person_id', $personId)
            ->where('type', 'receipt')
            ->whereIn('status', ['posted', 'confirmed'])
            ->sum('amount');

        $paid = (float) DB::table('acc_receipt_vouchers')
            ->where('tenant_id', $tenantId)
            ->where('person_id', $personId)
            ->where('type', 'payment')
            ->whereIn('status', ['posted', 'confirmed'])
            ->sum('amount');

        // What the shop owes them reduces what they owe the shop, and vice versa.
        return round($invoiced - $received + $paid, 2);
    }

    /**
     * Refuse a credit sale that would take the party past their limit.
     *
     * A limit of zero means cash only, and a blocked party means cash only regardless of the
     * limit — that is what "blocked" is for. Both are checked here rather than in each caller
     * so a new sales path cannot quietly bypass them.
     */
    public function assertCanBorrow(int $tenantId, int $personId, float $additional): void
    {
        $person = DB::table('acc_persons')->where('tenant_id', $tenantId)->where('id', $personId)->first();

        if ($person === null) {
            throw ValidationException::withMessages(['person_id' => __('api.party_not_found')]);
        }

        if ((bool) ($person->is_blocked ?? false)) {
            throw ValidationException::withMessages(['person_id' => __('api.party_blocked')]);
        }

        $limit = (float) ($person->credit_limit ?? 0);

        if ($limit <= 0) {
            throw ValidationException::withMessages(['person_id' => __('api.party_no_credit')]);
        }

        $projected = $this->balance($tenantId, $personId) + $additional;

        if ($projected > $limit + 0.01) {
            throw ValidationException::withMessages([
                'person_id' => __('api.party_over_credit_limit', [
                    'limit' => number_format($limit),
                    'balance' => number_format($this->balance($tenantId, $personId)),
                ]),
            ]);
        }
    }

    /**
     * The statement of account: every document, oldest first, with a running balance.
     *
     * @return array{person: array<string, mixed>|null, opening_balance: float, closing_balance: float, entries: list<array<string, mixed>>, credit_limit: float, available: float}
     */
    public function statement(int $tenantId, int $personId, ?string $from = null, ?string $to = null): array
    {
        $person = DB::table('acc_persons')->where('tenant_id', $tenantId)->where('id', $personId)->first();

        $entries = [];

        $invoices = DB::table('acc_invoices')
            ->where('tenant_id', $tenantId)
            ->where('person_id', $personId)
            ->whereIn('status', ['confirmed', 'posted'])
            ->when($to !== null, fn ($q) => $q->whereDate('document_date', '<=', $to))
            ->orderBy('document_date')
            ->get(['id', 'number', 'document_date', 'total', 'type']);

        foreach ($invoices as $invoice) {
            $entries[] = [
                'date' => (string) $invoice->document_date,
                'kind' => 'invoice',
                'reference' => $invoice->number,
                'description' => $invoice->type,
                'debit' => (float) $invoice->total,
                'credit' => 0.0,
            ];
        }

        $vouchers = DB::table('acc_receipt_vouchers')
            ->where('tenant_id', $tenantId)
            ->where('person_id', $personId)
            ->whereIn('status', ['posted', 'confirmed'])
            ->when($to !== null, fn ($q) => $q->whereDate('document_date', '<=', $to))
            ->orderBy('document_date')
            ->get(['id', 'number', 'document_date', 'amount', 'type']);

        foreach ($vouchers as $voucher) {
            $isReceipt = (string) $voucher->type === 'receipt';

            $entries[] = [
                'date' => (string) $voucher->document_date,
                'kind' => $isReceipt ? 'receipt' : 'payment',
                'reference' => $voucher->number,
                'description' => $isReceipt ? __('api.party_receipt') : __('api.party_payment'),
                // A receipt from the customer reduces what they owe; a payment to them increases it.
                'debit' => $isReceipt ? 0.0 : (float) $voucher->amount,
                'credit' => $isReceipt ? (float) $voucher->amount : 0.0,
            ];
        }

        usort($entries, fn (array $a, array $b): int => strcmp($a['date'], $b['date']));

        $limit = (float) ($person->credit_limit ?? 0);

        // Opening balance: everything before the window, so a mid-month statement still ends at
        // the same closing figure the aging report shows.
        $opening = 0.0;
        $rows = [];

        if ($from !== null) {
            foreach ($entries as $entry) {
                if ($entry['date'] < $from) {
                    $opening += $entry['debit'] - $entry['credit'];
                }
            }
        }

        $running = $opening;

        foreach ($entries as $entry) {
            if ($from !== null && $entry['date'] < $from) {
                continue;
            }

            $running += $entry['debit'] - $entry['credit'];
            $entry['balance'] = round($running, 2);
            $rows[] = $entry;
        }

        return [
            'person' => $person === null ? null : [
                'id' => (int) $person->id,
                'name' => $person->name,
                'mobile' => $person->mobile,
                'type' => $person->type,
                'credit_limit' => $limit,
                'is_blocked' => (bool) ($person->is_blocked ?? false),
            ],
            'opening_balance' => round($opening, 2),
            'closing_balance' => round($running, 2),
            'credit_limit' => $limit,
            'available' => round(max(0, $limit - $running), 2),
            'entries' => $rows,
        ];
    }
}
