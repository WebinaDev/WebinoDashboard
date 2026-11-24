<?php

namespace Modules\Accounting\Services;

use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\AccChartAccount;
use Modules\Accounting\Entities\AccFiscalYear;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccJournalLine;

/**
 * The one place the accounting module writes a journal entry from a document.
 *
 * Before this class, journalling was duplicated three ways with three different conventions:
 * `ReceiptController` hard-coded codes 111/113, `AccountingWpActionService` only flipped a
 * status without cutting a journal, and the cafe module posted sales through a *different*
 * ledger (`accounting_journals`, minor units). Three conventions meant three sets of numbers
 * that could not be reconciled.
 *
 * Two invariants are enforced here, not left to callers:
 *
 *  1. **Balanced or nothing.** A journal whose debit total differs from its credit total is
 *     rejected before a row is written. Posting an unbalanced entry is worse than failing:
 *     the trial balance then cannot be trusted and every later report inherits the error.
 *
 *  2. **A closed fiscal year is closed.** `acc_fiscal_years.is_closed` existed but nothing
 *     honoured it, so a back-dated entry could still land in a year the accountant had
 *     already signed off. A posting dated inside a closed year is refused.
 *
 * Amounts are in the chart's major unit (toman/rial as `decimal(18,2)`), which is what every
 * `acc_*` table already stores — unlike the cafe ledger, which holds minor units.
 */
final class LedgerPosting
{
    /**
     * Post a set of lines as one journal entry.
     *
     * @param  list<array{code: string, debit?: float|int, credit?: float|int, description?: string|null}>  $lines
     * @param  array{document_no?: string|null, document_date?: mixed, description?: string|null, created_by?: int|null, fiscal_year_id?: int|null, source?: string|null, status?: string|null}  $meta
     */
    public function post(array $lines, array $meta = []): AccJournalEntry
    {
        $resolved = [];
        $debit = 0.0;
        $credit = 0.0;

        foreach ($lines as $line) {
            $code = trim((string) ($line['code'] ?? ''));
            if ($code === '') {
                throw new \InvalidArgumentException('A journal line needs an account code.');
            }

            $dr = round((float) ($line['debit'] ?? 0), 2);
            $cr = round((float) ($line['credit'] ?? 0), 2);

            if ($dr < 0 || $cr < 0) {
                throw new \InvalidArgumentException('Journal amounts cannot be negative; swap the debit and credit instead.');
            }

            // A zero line carries no information and only makes a journal harder to read.
            if ($dr === 0.0 && $cr === 0.0) {
                continue;
            }

            if ($dr > 0.0 && $cr > 0.0) {
                throw new \InvalidArgumentException('A journal line is either a debit or a credit, never both.');
            }

            $resolved[] = [
                'account' => $this->accountFor($code),
                'debit' => $dr,
                'credit' => $cr,
                'description' => $line['description'] ?? null,
            ];

            $debit += $dr;
            $credit += $cr;
        }

        if ($resolved === []) {
            throw new \InvalidArgumentException('A journal entry needs at least one non-zero line.');
        }

        if (abs($debit - $credit) > 0.01) {
            throw new \InvalidArgumentException(sprintf(
                'Journal is unbalanced: debit %.2f, credit %.2f.',
                $debit,
                $credit,
            ));
        }

        $date = $meta['document_date'] ?? now();
        $date = $date instanceof \DateTimeInterface ? $date : \Illuminate\Support\Carbon::parse((string) $date);

        $fiscalYearId = $meta['fiscal_year_id'] ?? null;
        $this->assertYearOpen($date, $fiscalYearId);

        return DB::transaction(function () use ($resolved, $meta, $date, $fiscalYearId, $debit, $credit): AccJournalEntry {
            $entry = AccJournalEntry::query()->create([
                'fiscal_year_id' => $fiscalYearId ?? $this->yearIdFor($date),
                'document_no' => $meta['document_no'] ?? null,
                'document_date' => $date,
                'description' => $meta['description'] ?? null,
                'status' => $meta['status'] ?? 'posted',
                'created_by' => $meta['created_by'] ?? auth()->id(),
            ]);

            foreach ($resolved as $line) {
                AccJournalLine::query()->create([
                    'journal_entry_id' => $entry->id,
                    'account_id' => $line['account']->id,
                    'debit' => $line['debit'],
                    'credit' => $line['credit'],
                    'description' => $line['description'],
                ]);
            }

            return $entry->fresh(['lines.account']);
        });
    }

    /**
     * Post a receipt or payment voucher against the cash account it names.
     *
     * The shape is the accounting definition, not a preference:
     *
     *   receipt (money in)   Dr cash account / Cr the party account  (or treasury income)
     *   payment (money out)  Dr the party account / Cr cash account
     *
     * The counter-account comes from the tenant's account coding so an accountant can point
     * "receivable" at whatever code their chart uses. When the tenant never mapped one, the
     * voucher still posts: the counter side goes to the default receivable for a receipt and
     * payable for a payment, which is what those codes mean.
     */
    public function postVoucher(\Modules\Accounting\Entities\AccReceiptVoucher $voucher): AccJournalEntry
    {
        if ($voucher->status === 'posted') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'id' => 'This voucher is already posted to the ledger.',
            ]);
        }

        $amount = round((float) $voucher->amount, 2);
        if ($amount <= 0) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'amount' => 'A voucher must carry a positive amount before it can be posted.',
            ]);
        }

        $cashCode = $this->cashCodeFor($voucher);
        $counterCode = $this->counterCodeFor((string) $voucher->type);
        $isReceipt = (string) $voucher->type !== 'payment';
        $label = ($isReceipt ? 'رسید ' : 'پرداخت ').($voucher->number ?: '#'.$voucher->id);

        $lines = $isReceipt
            ? [
                ['code' => $cashCode, 'debit' => $amount, 'description' => $label],
                ['code' => $counterCode, 'credit' => $amount, 'description' => $label],
            ]
            : [
                ['code' => $counterCode, 'debit' => $amount, 'description' => $label],
                ['code' => $cashCode, 'credit' => $amount, 'description' => $label],
            ];

        $entry = $this->post($lines, [
            'document_no' => ($isReceipt ? 'RC-' : 'PV-').$voucher->id,
            'document_date' => $voucher->document_date ?? now(),
            'description' => $label.($voucher->description ? ' — '.$voucher->description : ''),
            'fiscal_year_id' => $voucher->fiscal_year_id,
            'created_by' => auth()->id() ?? $voucher->created_by,
        ]);

        $voucher->forceFill([
            'status' => 'posted',
            'journal_entry_id' => $entry->id,
        ])->save();

        return $entry;
    }

    /**
     * The chart account for a code, created on demand.
     *
     * Account coding may name a code the tenant has not added to their chart yet (the sales
     * journal already relies on this). Creating it with the shipped name and type beats
     * failing a sale because a settings screen was saved before the chart was edited.
     */
    private function accountFor(string $code): AccChartAccount
    {
        $existing = AccChartAccount::query()->where('code', $code)->first();
        if ($existing !== null) {
            return $existing;
        }

        $defaults = $this->defaultAccounts();
        $def = $defaults[$code] ?? ['name' => 'حساب '.$code, 'type' => 'asset'];

        return AccChartAccount::query()->create([
            'code' => $code,
            'name' => $def['name'],
            'type' => $def['type'],
            'is_postable' => true,
        ]);
    }

    /** Cash/drawer code for a voucher, from coding with a tolerant fallback. */
    private function cashCodeFor(\Modules\Accounting\Entities\AccReceiptVoucher $voucher): string
    {
        $coding = $this->coding();

        // A named cash account is more precise than the role default: a shop with a drawer
        // and three bank accounts must be able to say which one received the money. The
        // mapping is per cash-account id in `acc_cash_accounts.chart_code`.
        if ($voucher->cash_account_id !== null) {
            $code = DB::table('acc_cash_accounts')
                ->where('id', $voucher->cash_account_id)
                ->value('chart_code');

            if (is_string($code) && trim($code) !== '') {
                return trim($code);
            }

            $type = DB::table('acc_cash_accounts')
                ->where('id', $voucher->cash_account_id)
                ->value('type');

            // `cash` lands in the drawer; a bank/terminal/gateway lands in the bank.
            return (string) ($coding['roles'][$type === 'cash' ? 'cash' : 'bank'] ?? $coding['roles']['cash']);
        }

        return (string) $coding['roles']['cash'];
    }

    /**
     * The other side of a voucher.
     *
     * A receipt from a customer settles a receivable; a payment to a supplier settles a
     * payable. Both come from coding, so a chart that numbers these differently still posts.
     */
    private function counterCodeFor(string $type): string
    {
        $roles = $this->coding()['roles'];

        if ($type === 'payment') {
            return (string) ($roles['ap'] ?? $roles['payable'] ?? '2102');
        }

        return (string) ($roles['ar'] ?? '1101');
    }

    /**
     * Effective mapping for the active tenant.
     *
     * Reuses the cafe ledger's `AccountCoding` so there is exactly one answer to "which code
     * is sales", and falls back to shipped defaults outside a request.
     *
     * @return array{roles: array<string, string>, tenders: array<string, string>}
     */
    private function coding(): array
    {
        $tenantId = AccChartAccount::currentTenantId();

        if ($tenantId === null) {
            return ['roles' => $this->defaultRoles(), 'tenders' => []];
        }

        return app(\App\Services\Accounting\AccountCoding::class)->get($tenantId);
    }

    /** @return array<string, string> */
    private function defaultRoles(): array
    {
        $roles = [];
        foreach (\App\Services\Accounting\AccountCoding::defaults() as $role => $def) {
            $roles[$role] = $def['code'];
        }
        // Kept for callers that still say 'payable'; `ap` is the shipped name.
        $roles['ap'] ??= '2102';

        return $roles;
    }

    /** @return array<string, array{name: string, type: string}> */
    private function defaultAccounts(): array
    {
        $out = [];
        foreach (\App\Services\Accounting\AccountCoding::defaults() as $def) {
            $out[$def['code']] = ['name' => $def['name'], 'type' => $def['type']];
        }

        return $out;
    }

    /** Refuse to post into a fiscal year the accountant has closed. */
    private function assertYearOpen(\DateTimeInterface $date, ?int $fiscalYearId): void
    {
        $query = AccFiscalYear::query();

        if ($fiscalYearId !== null) {
            $query->whereKey($fiscalYearId);
        } else {
            $query->whereDate('starts_on', '<=', $date)->whereDate('ends_on', '>=', $date);
        }

        $year = $query->first();

        if ($year !== null && (bool) $year->is_closed) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'document_date' => 'This date falls in a closed fiscal year ('.$year->title.'). Reopen it or choose another date.',
            ]);
        }
    }

    /** The fiscal year a document belongs to, when the caller did not name one. */
    private function yearIdFor(\DateTimeInterface $date): ?int
    {
        return AccFiscalYear::query()
            ->whereDate('starts_on', '<=', $date)
            ->whereDate('ends_on', '>=', $date)
            ->value('id');
    }
}
