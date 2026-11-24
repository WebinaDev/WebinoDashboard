<?php

namespace App\Services\Accounting;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Accounting\Entities\AccJournalEntry;

/**
 * Rent, electricity, repairs — the expenses a shop actually writes down.
 *
 * Before this, recording a 12,000,000 rent payment meant opening the journal screen and knowing
 * which account to debit. That is a genuinely hard question for a café owner, and the answer
 * was that the ledger stayed empty and the P&L understated every cost except food.
 *
 * An expense names a *category* and a *cash account*; this class turns that into a balanced
 * journal — debit the expense, credit the drawer or the bank. The category maps to a chart code
 * so an accountant can point "rent" at their own numbering, and the sum lands in the P&L's
 * existing expense breakdown without any change to the report.
 */
final class ExpensePosting
{
    public function __construct(
        private readonly LedgerPosting $ledger,
        private readonly AccountCoding $coding,
    ) {}

    /** The categories the screen offers, each with its default chart code. */
    public const CATEGORIES = [
        'rent' => ['code' => '6102', 'name' => 'اجاره'],
        'utilities' => ['code' => '6103', 'name' => 'آب، برق و گاز'],
        'repairs' => ['code' => '6104', 'name' => 'تعمیر و نگهداری'],
        'supplies' => ['code' => '6105', 'name' => 'ملزومات'],
        'transport' => ['code' => '6106', 'name' => 'حمل و نقل'],
        'marketing' => ['code' => '6107', 'name' => 'بازاریابی'],
        'other' => ['code' => '6199', 'name' => 'سایر هزینه‌ها'],
    ];

    /**
     * @param  array{title: string, amount_minor: float, spent_on?: string|null, category?: string|null, cash_account_id?: int|null, reference?: string|null, notes?: string|null}  $data
     * @return array{expense_id: int, journal_entry_id: int|null, amount_minor: float}
     */
    public function record(int $tenantId, array $data, ?int $userId = null): array
    {
        $amount = round((float) $data['amount_minor'], 2);

        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount_minor' => __('api.expense_amount_positive')]);
        }

        $category = (string) ($data['category'] ?? 'other');
        $meta = self::CATEGORIES[$category] ?? self::CATEGORIES['other'];
        $expenseCode = $meta['code'];

        // Where the money came from decides the credit side: the drawer is cash, everything
        // else — bank, terminal, gateway — settles through the bank.
        $cashAccountId = $data['cash_account_id'] ?? null;
        $paymentCode = (string) ($this->coding->get($tenantId)['roles']['cash'] ?? '1102');

        if ($cashAccountId !== null) {
            $account = DB::table('acc_cash_accounts')
                ->where('tenant_id', $tenantId)
                ->where('id', $cashAccountId)
                ->first();

            if ($account === null) {
                throw ValidationException::withMessages(['cash_account_id' => __('api.cash_account_not_found')]);
            }

            if (trim((string) ($account->chart_code ?? '')) !== '') {
                $paymentCode = trim((string) $account->chart_code);
            } else {
                $paymentCode = (string) ($account->type === 'cash'
                    ? ($this->coding->get($tenantId)['roles']['cash'] ?? '1102')
                    : ($this->coding->get($tenantId)['roles']['bank'] ?? '1103'));
            }
        }

        return DB::transaction(function () use ($tenantId, $data, $userId, $amount, $category, $expenseCode, $paymentCode): array {
            $spentOn = $data['spent_on'] ?? now()->toDateString();

            $entry = AccJournalEntry::withoutTenancy(fn (): \Modules\Accounting\Entities\AccJournalEntry => $this->ledger->post(
                [
                    ['code' => $expenseCode, 'debit' => $amount, 'description' => $data['title']],
                    ['code' => $paymentCode, 'credit' => $amount, 'description' => $data['title']],
                ],
                [
                    'tenant_id' => $tenantId,
                    'document_date' => $spentOn,
                    'description' => $data['title'],
                    'document_no' => $data['reference'] ?? null,
                    // An expense can belong to one branch (that shop's electricity bill) or to
                    // none (head office). It is never guessed.
                    'branch_id' => $data['branch_id'] ?? null,
                    'status' => 'posted',
                    'created_by' => $userId,
                ],
            ));

            $expenseId = (int) DB::table('expenses')->insertGetId([
                'tenant_id' => $tenantId,
                'cash_account_id' => $data['cash_account_id'] ?? null,
                'category' => $category,
                'title' => $data['title'],
                'amount_minor' => $amount,
                'spent_on' => $spentOn,
                'payment_account_code' => $paymentCode,
                'expense_account_code' => $expenseCode,
                'reference' => $data['reference'] ?? null,
                'notes' => $data['notes'] ?? null,
                'branch_id' => $data['branch_id'] ?? null,
                'journal_entry_id' => $entry->id,
                'created_by' => $userId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return ['expense_id' => $expenseId, 'journal_entry_id' => (int) $entry->id, 'amount_minor' => $amount];
        });
    }
}
