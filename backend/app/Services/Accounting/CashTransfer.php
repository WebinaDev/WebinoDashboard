<?php

namespace App\Services\Accounting;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Accounting\Entities\AccCashAccount;
use Modules\Accounting\Services\LedgerPosting;

/**
 * Moving money between the shop's own accounts: drawer to safe, bank to drawer, drawer to petty
 * cash.
 *
 * This is the operation every shop performs weekly and had no way to record. Without it the
 * workaround was two manual journals — and a manual journal is where a transfer becomes a sale:
 * one wrong account code and the drawer looks like it earned money for moving cash to the bank.
 *
 * A transfer is deliberately **not** revenue and **not** an expense. Both sides are asset
 * accounts, so the entry is a debit to the destination and a credit to the source, for the same
 * amount. Nothing in the profit and loss moves, because nothing was earned or spent.
 *
 * Two refusals matter:
 *  - both accounts must be on the same tenant, checked by id rather than trusted from the request;
 *  - the source must have the money. Negative stock is sometimes honest (a miscount); negative
 *    cash is never anything but a mistake, and it hides the error in a balance nobody re-checks.
 */
final class CashTransfer
{
    public function __construct(private readonly LedgerPosting $ledger) {}

    /**
     * @return array<string, mixed>
     */
    public function transfer(int $tenantId, int $fromId, int $toId, float $amount, array $meta = []): array
    {
        if ($fromId === $toId) {
            throw ValidationException::withMessages([
                'to_account_id' => 'مبدأ و مقصد نمی‌توانند یکی باشند.',
            ]);
        }

        if ($amount <= 0) {
            throw ValidationException::withMessages([
                'amount_minor' => 'مبلغ انتقال باید بزرگ‌تر از صفر باشد.',
            ]);
        }

        $accounts = AccCashAccount::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', [$fromId, $toId])
            ->get()
            ->keyBy('id');

        $from = $accounts->get($fromId);
        $to = $accounts->get($toId);

        if (! $from || ! $to) {
            throw ValidationException::withMessages([
                'from_account_id' => 'حساب مبدأ یا مقصد در این کسب‌وکار پیدا نشد.',
            ]);
        }

        // A cash account with no chart code has no ledger identity, so a transfer through it
        // would post to nothing and vanish from every report.
        foreach ([$from, $to] as $account) {
            if (trim((string) $account->chart_code) === '') {
                throw ValidationException::withMessages([
                    'from_account_id' => 'حساب «'.$account->name.'» به حساب دفتر کل وصل نیست؛ ابتدا کد حساب آن را تعیین کنید.',
                ]);
            }
        }

        if (! $from->is_active || ! $to->is_active) {
            throw ValidationException::withMessages([
                'from_account_id' => 'انتقال روی حساب غیرفعال انجام نمی‌شود.',
            ]);
        }

        $available = $this->balanceOf($tenantId, (string) $from->chart_code);

        if ($amount > $available + 0.005) {
            throw ValidationException::withMessages([
                'amount_minor' => sprintf(
                    'موجودی «%s» کافی نیست: %.2f موجود است، %.2f درخواست شده.',
                    $from->name,
                    $available,
                    $amount,
                ),
            ]);
        }

        $entry = DB::transaction(function () use ($tenantId, $from, $to, $amount, $meta): mixed {
            return $this->ledger->post(
                [
                    ['code' => (string) $to->chart_code, 'debit' => $amount, 'description' => 'انتقال به '.$to->name],
                    ['code' => (string) $from->chart_code, 'credit' => $amount, 'description' => 'انتقال از '.$from->name],
                ],
                [
                    'description' => trim((string) ($meta['note'] ?? '')) !== ''
                        ? (string) $meta['note']
                        : 'انتقال وجه: '.$from->name.' → '.$to->name,
                    'document_date' => $meta['document_date'] ?? now(),
                    'branch_id' => $meta['branch_id'] ?? null,
                    // Tagged so a treasury report can tell a transfer apart from a sale.
                    'reference_type' => 'cash_transfer',
                    'reference_id' => null,
                    'created_by' => $meta['created_by'] ?? (auth()->id() ?? null),
                ],
            );
        });

        return [
            'from' => ['id' => (int) $from->id, 'name' => $from->name, 'balance_after_minor' => round($available - $amount, 2)],
            'to' => ['id' => (int) $to->id, 'name' => $to->name, 'balance_after_minor' => round($this->balanceOf($tenantId, (string) $to->chart_code), 2)],
            'amount_minor' => $amount,
            'journal_entry_id' => $entry->id ?? null,
        ];
    }

    /**
     * Debit minus credit on the chart account, posted journals only.
     *
     * Scoped by tenant explicitly: a raw builder has no global scope, and `code` is not
     * unique across shops — two tenants both number their drawer 1110. Without this filter
     * the balance check would read the other shop's drawer and either refuse a valid
     * transfer or wave through an overdraft.
     */
    private function balanceOf(int $tenantId, string $code): float
    {
        $row = DB::table('acc_journal_lines as jl')
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            // Cross-check both sides of the join: a line pointing at another tenant's
            // account is bad data, and summing it here would double-count it there.
            ->where('jl.tenant_id', $tenantId)
            ->where('a.tenant_id', $tenantId)
            ->where(function ($w): void {
                $w->where('je.status', 'posted')->orWhereNull('je.status');
            })
            ->where('a.code', $code)
            ->selectRaw('COALESCE(SUM(jl.debit),0) as d, COALESCE(SUM(jl.credit),0) as c')
            ->first();

        return round((float) ($row->d ?? 0) - (float) ($row->c ?? 0), 2);
    }
}
