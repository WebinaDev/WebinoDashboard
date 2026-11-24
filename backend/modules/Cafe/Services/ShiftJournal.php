<?php

namespace Modules\Cafe\Services;

use App\Models\AccAccount;
use App\Models\AccAccountCoding;
use App\Models\AccJournal;
use App\Models\AccJournalLine;
use App\Services\Accounting\AccountCoding;
use Illuminate\Support\Facades\DB;
use Modules\Cafe\Entities\CafeShift;

/**
 * Posts a closed shift's takings into the sales ledger.
 *
 * A cashier shift knows, precisely, how much money came in and by which tender. Until now that
 * knowledge stopped at the till: closing a shift wrote a status flag, and the shop's revenue
 * only appeared if somebody separately pressed "sync orders" in accounting. Two numbers, two
 * people, no guarantee they agree.
 *
 * The entry this writes lives in the *sales* ledger (`accounting_journals`, minor-unit
 * columns), which is the ledger `OrderAccountingSync` writes and the one the trial balance and
 * P&L read. It is deliberately **not** `LedgerPosting`, which writes the accounting module's
 * separate `acc_*` books — mixing the two would double a shop's revenue.
 *
 * Shape, per the accounting definition:
 *
 *   Dr  cash        cash takings            (the drawer)
 *   Dr  bank        card / wallet / online  (settles to the bank)
 *   Dr  ar          unpaid balance          (owed, not received)
 *   Dr  discount    discounts given         (kept visible instead of shrinking revenue)
 *     Cr  sales       gross revenue
 *     Cr  shipping    delivery fees
 *     Cr  vat         tax collected
 *
 * Cash movements are not posted here. A drop moves money from the drawer to the safe, and a
 * cash-out pays an expense; both are transfers or documents of their own, not revenue.
 *
 * Idempotent: a shift that already has `journal_entry_id` is never posted twice, so a retry
 * after a timeout cannot double the day's takings.
 */
final class ShiftJournal
{
    public function __construct(private readonly CafeShiftService $shifts) {}

    /**
     * Post the shift, or return the entry it already has.
     *
     * @return array{journal: AccJournal, created: bool}
     */
    public function post(CafeShift $shift): array
    {
        $existingId = $shift->journal_entry_id ?? null;

        if ($existingId !== null) {
            $existing = AccJournal::query()->find($existingId);

            if ($existing !== null) {
                return ['journal' => $existing, 'created' => false];
            }
        }

        $totals = is_array($shift->totals) && $shift->totals !== []
            ? $shift->totals
            : $this->shifts->computeTotals($shift);

        $gross = (int) ($totals['gross_sales_minor'] ?? 0);
        $tax = (int) ($totals['tax_minor'] ?? 0);
        $discount = (int) ($totals['discounts_minor'] ?? 0);
        $orders = (int) ($totals['orders'] ?? 0);

        if ($orders === 0 || ($gross === 0 && $discount === 0)) {
            // An empty drawer is a normal shift, not an error: there is simply nothing to
            // post, and writing a zero-value journal would only clutter the ledger.
            throw \Illuminate\Validation\ValidationException::withMessages([
                'shift' => __('api.cafe_shift_nothing_to_post'),
            ]);
        }

        $tenantId = (int) $shift->tenant_id;
        $coding = app(AccountCoding::class);
        $accounts = $coding->ensureAccounts($tenantId);

        return DB::transaction(function () use ($shift, $totals, $gross, $tax, $discount, $accounts, $tenantId, $coding): array {
            $byTender = is_array($totals['by_tender'] ?? null) ? $totals['by_tender'] : [];
            $cash = 0;
            $settledNonCash = 0;
            foreach ($byTender as $row) {
                $tender = (string) ($row['tender'] ?? '');
                $amount = (int) ($row['amount_minor'] ?? 0);
                if ($tender === 'cash' || $tender === 'cod') {
                    $cash += $amount;
                } else {
                    $settledNonCash += $amount;
                }
            }

            $shipping = (int) ($totals['shipping_minor'] ?? 0);
            // Unpaid: the guest still owes part of the bill.
            $outstanding = max(0, $gross - $cash - $settledNonCash);

            $journal = AccJournal::query()->create([
                'tenant_id' => $tenantId,
                'order_id' => null,
                'number' => 'SHIFT-'.$shift->id,
                'date' => ($shift->closed_at ?? now())->toDateString(),
                'description' => 'بستن شیفت #'.$shift->id.' — '.($totals['orders'] ?? 0).' سفارش',
                'status' => 'posted',
                'source' => 'cafe_shift',
                'total_debit_minor' => 0,
                'total_credit_minor' => 0,
            ]);

            $debit = 0;
            $credit = 0;

            $line = function (AccAccount $account, int $dr, int $cr) use ($journal, &$debit, &$credit): void {
                if ($dr === 0 && $cr === 0) {
                    return;
                }
                AccJournalLine::query()->create([
                    'journal_id' => $journal->id,
                    'account_code' => $account->code,
                    'account_name' => $account->name,
                    'debit_minor' => $dr,
                    'credit_minor' => $cr,
                ]);
                $debit += $dr;
                $credit += $cr;
            };

            // Credit: where the money came from.
            $revenue = max(0, $gross - $tax - $shipping);
            $line($accounts[AccAccountCoding::ROLE_SALES], 0, $revenue);
            if ($shipping > 0 && isset($accounts[AccAccountCoding::ROLE_SHIPPING])) {
                $line($accounts[AccAccountCoding::ROLE_SHIPPING], 0, $shipping);
            }
            if ($tax > 0) {
                $line($accounts[AccAccountCoding::ROLE_VAT], 0, $tax);
            }

            // Debit: what the shop is owed, then what it gave away.
            if ($discount > 0) {
                $line($accounts[AccAccountCoding::ROLE_DISCOUNT], $discount, 0);
            }

            // Then what actually arrived, per tender.
            foreach ($byTender as $row) {
                $tender = (string) ($row['tender'] ?? '');
                $amount = (int) ($row['amount_minor'] ?? 0);
                if ($amount <= 0) {
                    continue;
                }

                $code = $coding->tenderCode($tenantId, $tender);
                $account = $accounts['tender:'.$tender] ?? null;

                if ($account === null) {
                    // A tender the coding never saw (a custom payment method): find or make
                    // its account rather than dropping the money from the journal.
                    $account = AccAccount::query()->firstOrCreate(
                        ['tenant_id' => $tenantId, 'code' => $code],
                        ['name' => $tender, 'type' => 'asset'],
                    );
                }

                $line($account, $amount, 0);
            }

            if ($outstanding > 0) {
                $line($accounts[AccAccountCoding::ROLE_AR], $outstanding, 0);
            }

            // Balancing plug. Rounding a dozen tenders can leave a unit or two over; the
            // difference belongs on the discount line, which is where till rounding is
            // ordinarily absorbed, rather than making the journal refuse to post.
            if ($debit !== $credit) {
                $delta = $debit - $credit;
                if (isset($accounts[AccAccountCoding::ROLE_DISCOUNT])) {
                    $line($accounts[AccAccountCoding::ROLE_DISCOUNT], max(0, -$delta), max(0, $delta));
                }
            }

            $journal->update([
                'total_debit_minor' => $debit,
                'total_credit_minor' => $credit,
            ]);

            $shift->forceFill(['journal_entry_id' => $journal->id])->save();

            return ['journal' => $journal->fresh(['lines']), 'created' => true];
        });
    }
}
