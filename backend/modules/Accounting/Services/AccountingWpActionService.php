<?php

namespace Modules\Accounting\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Database\Seeders\AccChartIranSeeder;
use Modules\Accounting\Entities\AccCashAccount;
use Modules\Accounting\Entities\AccChartAccount;
use Modules\Accounting\Entities\AccCheck;
use Modules\Accounting\Entities\AccFiscalYear;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccJournalLine;
use Modules\Accounting\Entities\AccountingInvoice;
use Modules\Accounting\Entities\AccountingSetting;
use Modules\Accounting\Entities\AccPerson;
use Modules\Accounting\Entities\AccPersonCategory;
use Modules\Accounting\Entities\AccPriceList;
use Modules\Accounting\Entities\AccPriceListItem;
use Modules\Accounting\Entities\AccProduct;
use Modules\Accounting\Entities\AccProductCategory;
use Modules\Accounting\Entities\AccReceiptVoucher;
use Modules\Accounting\Entities\AccUnit;
use Modules\Accounting\Support\AccountingQuery;
use Modules\Accounting\Support\ExistsForTenant;

/**
 * Maps legacy webinocrm_accounting_{action} payloads to domain models.
 */
class AccountingWpActionService
{
    public function handle(string $action, Request $request): array
    {
        $p = $request->except([
            'password', 'token', 'authorization', 'cookie', 'current_password',
            'private_key', 'secret', 'api_key', 'access_token',
        ]);

        return match ($action) {
            'fiscal_years' => ['items' => AccFiscalYear::query()->orderByDesc('starts_on')->get()->all()],
            'fiscal_year_save' => $this->fiscalYearSave($p, $request),
            'fiscal_year_delete' => $this->fiscalYearDelete($p),
            'chart_list' => ['items' => AccChartAccount::query()->orderBy('code')->get()->all()],
            'chart_save' => $this->chartSave($p, $request),
            'chart_delete' => $this->chartDelete($p),
            'journal_list' => $this->journalList($p),
            'journal_get' => $this->journalGet($p),
            'journal_save' => $this->journalSave($p, $request),
            'journal_post' => $this->journalPost($p),
            'journal_delete' => $this->journalDelete($p),
            'ledger' => $this->ledgerData($p),
            'report_trial_balance' => $this->reportTrialBalance($p),
            'report_balance_sheet' => $this->reportBalanceSheet($p),
            'report_profit_loss' => $this->reportProfitLoss($p),
            'settings_get' => $this->settingsGet(),
            'settings_save' => $this->settingsSave($p),
            'seed_chart' => $this->seedChart(),
            'person_categories' => ['items' => AccPersonCategory::query()->orderBy('sort_order')->get()->all()],
            'product_categories' => ['items' => AccProductCategory::query()->orderBy('sort_order')->get()->all()],
            'person_category_save' => $this->personCategorySave($p),
            'person_category_delete' => $this->personCategoryDelete($p),
            'product_category_save' => $this->productCategorySave($p),
            'product_category_delete' => $this->productCategoryDelete($p),
            'units_list' => ['items' => AccUnit::query()->orderBy('name')->get()->all()],
            'unit_save' => $this->unitSave($p),
            'unit_delete' => $this->unitDelete($p),
            'price_lists' => ['items' => AccPriceList::query()->orderBy('name')->get()->all()],
            'price_list_get' => $this->priceListGet($p),
            'price_list_save' => $this->priceListSave($p),
            'price_list_delete' => $this->priceListDelete($p),
            'price_list_items' => $this->priceListItems($p),
            'price_list_items_save' => $this->priceListItemsSave($p),
            'persons_list' => ['items' => AccPerson::query()->orderByDesc('id')->limit(500)->get()->all(), 'total' => AccPerson::query()->count()],
            'person_get' => ['person' => AccPerson::query()->find($p['id'] ?? $p['person_id'] ?? 0)],
            'person_save' => $this->personSave($p, $request),
            'person_delete' => $this->personDelete($p),
            'products_list' => ['items' => AccProduct::query()->orderBy('name')->limit(500)->get()->all(), 'total' => AccProduct::query()->count()],
            'product_get' => ['product' => AccProduct::query()->find($p['id'] ?? $p['product_id'] ?? 0)],
            'product_save' => $this->productSave($p, $request),
            'product_delete' => $this->productDelete($p),
            'user_defaults_get' => $this->userDefaultsGet($request),
            'user_defaults_save' => $this->userDefaultsSave($p, $request),
            'invoice_list' => ['items' => AccountingInvoice::query()->with('person')->orderByDesc('id')->limit(200)->get()->all(), 'total' => AccountingInvoice::query()->count()],
            'invoice_get' => $this->invoiceGet($p),
            'invoice_save' => $this->invoiceSave($p, $request),
            'invoice_delete' => $this->invoiceDelete($p),
            'invoice_next_number' => $this->invoiceNextNumber($p),
            'invoice_confirm' => $this->invoiceConfirm($p),
            'cash_accounts_list' => ['items' => AccCashAccount::query()->orderBy('name')->get()->all()],
            'cash_account_get' => ['cash_account' => AccCashAccount::query()->find($p['id'] ?? 0)],
            'cash_account_save' => $this->cashAccountSave($p, $request),
            'cash_account_delete' => $this->cashAccountDelete($p),
            'receipt_voucher_list' => ['items' => AccReceiptVoucher::query()->orderByDesc('id')->limit(200)->get()->all(), 'total' => AccReceiptVoucher::query()->count()],
            'receipt_voucher_get' => ['voucher' => AccReceiptVoucher::query()->find($p['id'] ?? 0)],
            'receipt_voucher_save' => $this->receiptSave($p, $request),
            'receipt_voucher_post' => $this->receiptPost($p),
            'receipt_voucher_delete' => $this->receiptDelete($p),
            'receipt_voucher_next_number' => $this->receiptNextNumber($p),
            // The dashboard screen calls these shorter names. They used to fall through to
            // the catch-all below and return `ok: true` without writing anything, so a
            // cashier's receipt vanished with a success toast. Kept as explicit aliases
            // rather than a prefix match: the two vocabularies must stay greppable.
            'receipt_save' => $this->receiptSave($p, $request),
            'receipt_post' => $this->receiptPost($p),
            'receipt_delete' => $this->receiptDelete($p),
            'receipt_next_number' => $this->receiptNextNumber($p),
            'check_list' => ['items' => AccCheck::query()->orderByDesc('id')->limit(200)->get()->all(), 'total' => AccCheck::query()->count()],
            'check_get' => ['check' => AccCheck::query()->find($p['id'] ?? 0)],
            'check_save' => $this->checkSave($p, $request),
            'check_delete' => $this->checkDelete($p),
            'check_set_status' => $this->checkSetStatus($p),
            // Deliberately no `default => ['ok' => true]`. A successful-looking reply for an
            // action nobody implemented is how the receipt form above saved nothing for
            // months. The controller validates the action list first, so reaching here with
            // an unknown key is a programming error and must be loud.
            default => throw new \InvalidArgumentException('Unknown accounting action ['.$action.'].'),
        };
    }

    private function fiscalYearSave(array $p, Request $request): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_fiscal_years')],
            'title' => 'required|string|max:100',
            'starts_on' => 'required|date',
            'ends_on' => 'required|date|after:starts_on',
            'is_closed' => 'nullable|boolean',
        ])->validate();

        if (! empty($data['id'])) {
            $fy = AccFiscalYear::query()->findOrFail($data['id']);
            $fy->update(collect($data)->except('id')->all());
        } else {
            $fy = AccFiscalYear::query()->create($data);
        }

        return ['item' => $fy->fresh()];
    }

    private function fiscalYearDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccFiscalYear::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function chartSave(array $p, Request $request): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_chart_accounts')],
            'code' => 'required|string|max:50',
            'name' => 'required|string|max:255',
            'parent_id' => ['nullable', ExistsForTenant::in('acc_chart_accounts')],
            'type' => 'required|string|max:50',
            'is_postable' => 'nullable|boolean',
        ])->validate();

        if (! empty($data['id'])) {
            $row = AccChartAccount::query()->findOrFail($data['id']);
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccChartAccount::query()->create($data);
        }

        return ['item' => $row->fresh()];
    }

    private function chartDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccChartAccount::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function journalList(array $p): array
    {
        $q = AccJournalEntry::query()->with('lines')->orderByDesc('document_date')->limit(100);
        if (! empty($p['fiscal_year_id'])) {
            $q->where('fiscal_year_id', $p['fiscal_year_id']);
        }

        return ['items' => $q->get()->all(), 'total' => AccJournalEntry::query()->count()];
    }

    private function journalGet(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        $entry = AccJournalEntry::query()->with('lines.account')->find($id);

        return ['entry' => $entry, 'lines' => $entry?->lines ?? []];
    }

    private function journalSave(array $p, Request $request): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_journal_entries')],
            'fiscal_year_id' => ['nullable', ExistsForTenant::in('acc_fiscal_years')],
            'document_no' => 'nullable|string|max:50',
            'document_date' => 'required|date',
            'description' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.account_id' => ['required', ExistsForTenant::in('acc_chart_accounts')],
            'lines.*.debit' => 'nullable|numeric|min:0',
            'lines.*.credit' => 'nullable|numeric|min:0',
            'lines.*.description' => 'nullable|string',
        ])->validate();

        return DB::transaction(function () use ($data, $request) {
            $payload = collect($data)->except('lines', 'id');
            $payload['created_by'] = $request->user()?->id;

            if (! empty($data['id'])) {
                $entry = AccJournalEntry::query()->findOrFail($data['id']);
                $entry->update($payload->all());
                AccJournalLine::query()->where('journal_entry_id', $entry->id)->delete();
            } else {
                $entry = AccJournalEntry::query()->create(array_merge($payload->all(), ['status' => 'draft']));
            }

            foreach ($data['lines'] as $line) {
                AccJournalLine::query()->create([
                    'journal_entry_id' => $entry->id,
                    'account_id' => $line['account_id'],
                    'debit' => $line['debit'] ?? 0,
                    'credit' => $line['credit'] ?? 0,
                    'description' => $line['description'] ?? null,
                ]);
            }

            return ['entry' => $entry->fresh('lines')];
        });
    }

    /**
     * Delete a draft. A posted entry is not deletable: it is a record of something that
     * happened, and removing it would silently change every report that already counted it.
     */
    private function journalDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);

        if ($id) {
            $entry = AccJournalEntry::query()->findOrFail($id);

            if ((string) $entry->status === 'posted') {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'id' => ['سند ثبت‌شده حذف نمی‌شود؛ برای اصلاح، سند اصلاحی بزنید.'],
                ]);
            }

            $entry->delete();
        }

        return ['ok' => true];
    }

    /**
     * Post a draft entry — after checking it is a journal and not a list of numbers.
     *
     * Posting used to be a status flip. A draft with one line, or with 500 debit and 400 credit,
     * posted happily and then sat in the trial balance as an imbalance that no report could
     * explain, because nothing had ever refused it. An entry that cannot balance is rejected
     * here, while a person is still looking at it.
     *
     * Drafts are editable (`journal_save` replaces their lines); posted entries are not, because
     * the alternative is a posted figure that means something different tomorrow.
     */
    private function journalPost(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        $entry = AccJournalEntry::query()->findOrFail($id);

        if ((string) $entry->status === 'posted') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'id' => ['این سند قبلاً ثبت شده است.'],
            ]);
        }

        $lines = AccJournalLine::query()->where('journal_entry_id', $entry->id)->get();

        if ($lines->count() < 2) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'lines' => ['سند باید حداقل دو ردیف داشته باشد.'],
            ]);
        }

        $debit = 0.0;
        $credit = 0.0;

        foreach ($lines as $line) {
            $dr = (float) $line->debit;
            $cr = (float) $line->credit;

            // One line, one side. A line that is both is a typo that always balances wrongly.
            if ($dr > 0.0 && $cr > 0.0) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'lines' => ['هر ردیف یا بدهکار است یا بستانکار، نه هر دو.'],
                ]);
            }

            $debit += $dr;
            $credit += $cr;
        }

        if (abs($debit - $credit) > 0.01) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'lines' => [sprintf(
                    'سند ناتراز است: بدهکار %s، بستانکار %s.',
                    number_format($debit, 2),
                    number_format($credit, 2),
                )],
            ]);
        }

        if ($debit <= 0.0) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'lines' => ['سند بدون مبلغ را نمی‌توان ثبت کرد.'],
            ]);
        }

        $entry->update(['status' => 'posted']);

        return ['ok' => true, 'posted' => true, 'entry' => $entry->fresh('lines')];
    }

    private function ledgerData(array $p): array
    {
        $q = AccountingQuery::journalLines()
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->select([
                'jl.id',
                'je.document_date',
                'je.document_no',
                'a.code',
                'a.name',
                'jl.debit',
                'jl.credit',
            ])
            ->orderBy('je.document_date');

        if (! empty($p['account_id'])) {
            $q->where('jl.account_id', $p['account_id']);
        }

        return ['lines' => $q->limit(500)->get()->all()];
    }

    private function reportTrialBalance(array $p): array
    {
        $base = AccountingQuery::journalLines()
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->where(function ($w) {
                $w->where('je.status', 'posted')->orWhereNull('je.status');
            })
            ->select([
                'a.code',
                'a.name',
                DB::raw('SUM(jl.debit) as debit'),
                DB::raw('SUM(jl.credit) as credit'),
            ])
            ->groupBy('a.id', 'a.code', 'a.name');

        if (! empty($p['from']) && ! empty($p['to'])) {
            $base->whereBetween('je.date', [$p['from'], $p['to']]);
        }

        return ['rows' => $base->get()->all()];
    }

    private function reportBalanceSheet(array $p): array
    {
        $q = AccountingQuery::journalLines()
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->whereIn('a.type', ['asset', 'liability', 'equity'])
            ->where(function ($w) {
                $w->where('je.status', 'posted')->orWhereNull('je.status');
            })
            ->select([
                'a.type',
                'a.code',
                'a.name',
                DB::raw('SUM(jl.debit - jl.credit) as balance'),
            ])
            ->groupBy('a.id', 'a.type', 'a.code', 'a.name')
            ->orderBy('a.code');

        if (! empty($p['from']) && ! empty($p['to'])) {
            $q->whereBetween('je.date', [$p['from'], $p['to']]);
        }

        return ['rows' => $q->get()->all(), 'statement' => 'balance_sheet'];
    }

    private function reportProfitLoss(array $p): array
    {
        $q = AccountingQuery::journalLines()
            ->join('acc_journal_entries as je', 'jl.journal_entry_id', '=', 'je.id')
            ->join('acc_chart_accounts as a', 'jl.account_id', '=', 'a.id')
            ->whereIn('a.type', ['revenue', 'expense'])
            ->where(function ($w) {
                $w->where('je.status', 'posted')->orWhereNull('je.status');
            })
            ->select([
                'a.type',
                'a.code',
                'a.name',
                DB::raw('SUM(jl.credit - jl.debit) as balance'),
            ])
            ->groupBy('a.id', 'a.type', 'a.code', 'a.name')
            ->orderBy('a.code');

        if (! empty($p['from']) && ! empty($p['to'])) {
            $q->whereBetween('je.date', [$p['from'], $p['to']]);
        }

        return ['rows' => $q->get()->all(), 'statement' => 'profit_and_loss'];
    }

    private function settingsGet(): array
    {
        $money = \Modules\Accounting\Support\AccountingMoney::settingsPayload();
        $money['fiscal_year_id'] = AccountingSetting::get('accounting_default_fiscal_year_id');

        return $money;
    }

    private function settingsSave(array $p): array
    {
        \Modules\Accounting\Support\AccountingMoney::saveSettings([
            'currency' => $p['currency'] ?? null,
            'currency_symbol' => $p['currency_symbol'] ?? null,
            'decimals' => $p['decimals'] ?? null,
            'thousand_separator' => $p['thousand_separator'] ?? null,
            'decimal_separator' => $p['decimal_separator'] ?? null,
        ]);

        if (isset($p['fiscal_year_id'])) {
            AccountingSetting::set('accounting_default_fiscal_year_id', (string) $p['fiscal_year_id'], 'accounting');
        }

        return $this->settingsGet();
    }

    private function seedChart(): array
    {
        if (AccChartAccount::query()->exists()) {
            return ['count' => 0, 'message' => __('api.chart_already_seeded')];
        }

        // The full Iranian chart, not five bare roots: confirming an invoice posts to the
        // postable accounts 113 (receivables) and 401 (sales), and a five-root chart has
        // neither, so the seed button used to leave the ledger unusable. The seeder is
        // tenant-scoped and skips codes that already exist.
        $result = AccChartIranSeeder::run();

        return ['count' => $result['inserted'], 'skipped' => $result['skipped']];
    }

    private function personSave(array $p, Request $request): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_persons')],
            'name' => 'required|string|max:255',
            'type' => 'nullable|string|max:20',
            'national_id' => 'nullable|string|max:20',
            'economic_code' => 'nullable|string|max:50',
            'mobile' => 'nullable|string|max:30',
            'address' => 'nullable|string',
            'category' => 'nullable|string|max:100',
        ])->validate();

        if (! empty($data['id'])) {
            $row = AccPerson::query()->findOrFail($data['id']);
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccPerson::query()->create(collect($data)->except('id')->all());
        }

        return ['person' => $row->fresh()];
    }

    private function personDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccPerson::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function productSave(array $p, Request $request): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_products')],
            'name' => 'required|string|max:255',
            'unit' => 'nullable|string|max:50',
            'barcode' => 'nullable|string|max:100',
            'category' => 'nullable|string|max:100',
            'buy_price' => 'nullable|numeric',
            'sell_price' => 'nullable|numeric',
            'inventory_controlled' => 'nullable|boolean',
        ])->validate();

        if (! empty($data['id'])) {
            $row = AccProduct::query()->findOrFail($data['id']);
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccProduct::query()->create(collect($data)->except('id')->all());
        }

        return ['product' => $row->fresh()];
    }

    private function productDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccProduct::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function invoiceSave(array $p, Request $request): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_invoices')],
            'type' => 'nullable|string|max:30',
            'number' => 'nullable|string|max:50',
            'fiscal_year_id' => ['nullable', ExistsForTenant::in('acc_fiscal_years')],
            'person_id' => ['nullable', ExistsForTenant::in('acc_persons')],
            'document_date' => 'nullable|date',
            'status' => 'nullable|string|max:30',
            'items' => 'nullable|array',
            'subtotal' => 'nullable|numeric',
            'tax' => 'nullable|numeric',
            'total' => 'nullable|numeric',
        ])->validate();

        $data['created_by'] = $request->user()?->id;

        if (! empty($data['id'])) {
            $inv = AccountingInvoice::query()->findOrFail($data['id']);
            $inv->update(collect($data)->except('id')->all());
        } else {
            $inv = AccountingInvoice::query()->create(collect($data)->except('id')->all());
        }

        return ['invoice' => $inv->fresh()];
    }

    private function invoiceDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccountingInvoice::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function invoiceNextNumber(array $p): array
    {
        $fy = $p['fiscal_year_id'] ?? null;
        $q = AccountingInvoice::query();
        if ($fy) {
            $q->where('fiscal_year_id', $fy);
        }
        $maxNum = $q->get()->map(fn (AccountingInvoice $i) => (int) preg_replace('/\D/', '', (string) $i->number))->max();
        $next = max(1001, ($maxNum ?: 1000) + 1);

        return ['invoice_no' => (string) $next];
    }

    private function invoiceConfirm(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        $inv = AccountingInvoice::query()->findOrFail($id);
        $inv->update(['status' => 'confirmed']);

        return ['invoice' => $inv];
    }

    private function cashAccountSave(array $p, Request $request): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_cash_accounts')],
            'name' => 'required|string|max:191',
            'type' => 'nullable|string|max:30',
            'bank_name' => 'nullable|string|max:191',
            'account_number' => 'nullable|string|max:100',
            'sheba' => 'nullable|string|max:30',
            'card_number' => 'nullable|string|max:30',
            'chart_code' => 'nullable|string|max:32',
            'is_active' => 'nullable|boolean',
            'is_default' => 'nullable|boolean',
        ])->validate();

        if (! empty($data['id'])) {
            $row = AccCashAccount::query()->findOrFail($data['id']);
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccCashAccount::query()->create(collect($data)->except('id')->all());
        }

        return ['cash_account' => $row->fresh()];
    }

    private function cashAccountDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccCashAccount::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    /**
     * Create or edit a receipt/payment voucher.
     *
     * The dashboard form speaks `date` and stores a single `amount`; the table speaks
     * `document_date`. Both are accepted here and normalised, because a form field name is
     * not a good reason for a save to fail validation silently.
     *
     * `type` decides the direction: `receipt` (money in from a customer) or `payment`
     * (money out to a supplier/staff). A posted voucher is immutable — editing it would let
     * a settled amount change after the journal was cut.
     */
    private function receiptSave(array $p, Request $request): array
    {
        $p['type'] = in_array(($p['type'] ?? ''), ['receipt', 'payment'], true) ? $p['type'] : 'receipt';
        // The form posts `date`; the column is `document_date`.
        if (! array_key_exists('document_date', $p) && array_key_exists('date', $p)) {
            $p['document_date'] = $p['date'];
        }
        // A till sends an empty string for "no person / no cash account".
        foreach (['person_id', 'cash_account_id', 'fiscal_year_id'] as $key) {
            if (($p[$key] ?? null) === '') {
                $p[$key] = null;
            }
        }

        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_receipt_vouchers')],
            'type' => 'required|string|in:receipt,payment',
            'number' => 'nullable|string|max:50',
            'fiscal_year_id' => ['nullable', ExistsForTenant::in('acc_fiscal_years')],
            'cash_account_id' => ['nullable', ExistsForTenant::in('acc_cash_accounts')],
            'person_id' => ['nullable', ExistsForTenant::in('acc_persons')],
            'amount' => 'required|numeric|min:0.01',
            'document_date' => 'nullable|date',
            'status' => 'nullable|string|in:draft,posted,cancelled',
            'description' => 'nullable|string',
        ])->validate();

        $data['created_by'] = $request->user()?->id;

        if (! empty($data['id'])) {
            $row = AccReceiptVoucher::query()->findOrFail($data['id']);
            if ($row->status === 'posted') {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'id' => __('api.already_posted'),
                ]);
            }
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccReceiptVoucher::query()->create(collect($data)->except('id')->all());
        }

        return ['voucher' => $row->fresh(['cashAccount', 'person'])];
    }

    /**
     * Post a voucher to the ledger.
     *
     * Until this existed `post` only flipped `status = posted` and cut no journal, so the
     * voucher list showed money the books had never seen. The journal is built from the
     * tenant's account coding (`AccountCoding`), not from hard-coded 111/113, and it is
     * refused when the amount is zero or the voucher has already moved the ledger once.
     */
    private function receiptPost(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        $row = AccReceiptVoucher::query()->findOrFail($id);

        $ledger = app(\Modules\Accounting\Services\LedgerPosting::class);
        $journal = $ledger->postVoucher($row);

        return ['voucher' => $row->fresh(['cashAccount', 'person']), 'journal' => $journal];
    }

    private function receiptDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccReceiptVoucher::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function receiptNextNumber(array $p): array
    {
        $maxNum = AccReceiptVoucher::query()->get()->map(fn (AccReceiptVoucher $r) => (int) preg_replace('/\D/', '', (string) $r->number))->max();
        $next = max(2001, ($maxNum ?: 2000) + 1);

        return ['voucher_no' => (string) $next];
    }

    private function checkSave(array $p, Request $request): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_checks')],
            'type' => 'nullable|string|max:30',
            'number' => 'nullable|string|max:50',
            'bank' => 'nullable|string|max:191',
            'amount' => 'nullable|numeric',
            'due_date' => 'nullable|date',
            'status' => 'nullable|string|max:30',
            'cash_account_id' => ['nullable', ExistsForTenant::in('acc_cash_accounts')],
            'person_id' => ['nullable', ExistsForTenant::in('acc_persons')],
        ])->validate();

        if (! empty($data['id'])) {
            $row = AccCheck::query()->findOrFail($data['id']);
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccCheck::query()->create(collect($data)->except('id')->all());
        }

        return ['check' => $row->fresh()];
    }

    private function checkDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccCheck::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    /**
     * A status change posts the movement it implies, so a bounced cheque reopens the debt.
     *
     * The old version flipped the column and nothing else, which left the bank balance claiming
     * money the bank had already handed back.
     */
    private function checkSetStatus(array $p): array
    {
        $data = validator($p, [
            'id' => ['required', ExistsForTenant::in('acc_checks')],
            'status' => ['required', 'string', 'in:issued,deposited,cleared,bounced,returned,pending,collected,spent,cancelled'],
            'note' => ['nullable', 'string', 'max:255'],
        ])->validate();

        $row = AccCheck::query()->findOrFail($data['id']);

        $updated = app(\App\Services\Accounting\ChequeLedger::class)->setStatus(
            (int) $row->tenant_id,
            (int) $row->id,
            (string) $data['status'],
            isset($data['note']) ? (string) $data['note'] : null,
            auth()->id(),
        );

        return ['check' => $updated];
    }

    private function invoiceGet(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        $inv = AccountingInvoice::query()->find($id);
        $lines = [];
        if ($inv && is_array($inv->items)) {
            $lines = $inv->items;
        }

        return ['invoice' => $inv, 'lines' => $lines];
    }

    private function personCategorySave(array $p): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_person_categories')],
            'name' => 'required|string|max:191',
            'sort_order' => 'nullable|integer|min:0',
        ])->validate();
        if (! empty($data['id'])) {
            $row = AccPersonCategory::query()->findOrFail($data['id']);
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccPersonCategory::query()->create(collect($data)->except('id')->all());
        }

        return ['item' => $row->fresh()];
    }

    private function personCategoryDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccPersonCategory::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function productCategorySave(array $p): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_product_categories')],
            'name' => 'required|string|max:191',
            'sort_order' => 'nullable|integer|min:0',
        ])->validate();
        if (! empty($data['id'])) {
            $row = AccProductCategory::query()->findOrFail($data['id']);
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccProductCategory::query()->create(collect($data)->except('id')->all());
        }

        return ['item' => $row->fresh()];
    }

    private function productCategoryDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccProductCategory::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function unitSave(array $p): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_units')],
            'name' => 'required|string|max:50',
            'symbol' => 'nullable|string|max:20',
        ])->validate();
        if (! empty($data['id'])) {
            $row = AccUnit::query()->findOrFail($data['id']);
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccUnit::query()->create(collect($data)->except('id')->all());
        }

        return ['item' => $row->fresh()];
    }

    private function unitDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccUnit::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function priceListGet(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);

        return ['price_list' => AccPriceList::query()->with('items.product')->find($id)];
    }

    private function priceListSave(array $p): array
    {
        $data = validator($p, [
            'id' => ['nullable', ExistsForTenant::in('acc_price_lists')],
            'name' => 'required|string|max:191',
            'is_active' => 'nullable|boolean',
        ])->validate();
        if (! empty($data['id'])) {
            $row = AccPriceList::query()->findOrFail($data['id']);
            $row->update(collect($data)->except('id')->all());
        } else {
            $row = AccPriceList::query()->create(collect($data)->except('id')->all());
        }

        return ['price_list' => $row->fresh()];
    }

    private function priceListDelete(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        if ($id) {
            AccPriceList::query()->whereKey($id)->delete();
        }

        return ['ok' => true];
    }

    private function priceListItems(array $p): array
    {
        $id = (int) ($p['price_list_id'] ?? $p['id'] ?? 0);
        $items = AccPriceListItem::query()->where('price_list_id', $id)->with('product')->get();

        return ['items' => $items->all()];
    }

    private function priceListItemsSave(array $p): array
    {
        $data = validator($p, [
            'price_list_id' => ['required', ExistsForTenant::in('acc_price_lists')],
            'items' => 'required|array',
            'items.*.product_id' => ['required', ExistsForTenant::in('acc_products')],
            'items.*.price' => 'required|numeric|min:0',
        ])->validate();
        AccPriceListItem::query()->where('price_list_id', $data['price_list_id'])->delete();
        foreach ($data['items'] as $row) {
            AccPriceListItem::query()->create([
                'price_list_id' => $data['price_list_id'],
                'product_id' => $row['product_id'],
                'price' => $row['price'],
            ]);
        }

        return ['items' => AccPriceListItem::query()->where('price_list_id', $data['price_list_id'])->get()->all()];
    }

    private function userDefaultsGet(Request $request): array
    {
        $key = 'accounting_user_defaults_'.$request->user()->id;
        $raw = AccountingSetting::get($key, '{}');
        $defaults = json_decode((string) $raw, true);
        if (! is_array($defaults)) {
            $defaults = [];
        }

        return [
            'defaults' => array_merge([
                'default_invoice_person_id' => null,
                'default_price_list_id' => null,
            ], $defaults),
        ];
    }

    private function userDefaultsSave(array $p, Request $request): array
    {
        $data = validator($p, [
            'defaults' => 'required|array',
        ])->validate();
        $key = 'accounting_user_defaults_'.$request->user()->id;
        AccountingSetting::set($key, json_encode($data['defaults']), 'accounting');

        return ['ok' => true, 'defaults' => $data['defaults']];
    }
}
