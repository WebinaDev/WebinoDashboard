<?php

namespace App\Services\Accounting;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Services\LedgerPosting;

/**
 * What the shop owes its suppliers, with a due date.
 *
 * A purchase used to be two events: goods in, money out. The bill in between — the supplier's
 * claim, with its own number and its own due date — had nowhere to live, so payables were
 * whatever the receipts implied and "what do we owe, and when" could not be answered.
 *
 * Posting a bill debits inventory (or the expense account for a service) and credits payables.
 * The stock was already debited when the goods arrived, so a bill for a delivery that has
 * already been received must *not* debit inventory again: `$alreadyInStock` says which, and the
 * caller decides from whether the bill is attached to a received purchase order.
 */
final class SupplierBills
{
    public function __construct(
        private readonly LedgerPosting $ledger,
        private readonly AccountCoding $coding,
    ) {}

    /**
     * @param  array{supplier_id?: int|null, purchase_order_id?: int|null, number?: string|null, supplier_reference?: string|null, issued_on?: string|null, due_on?: string|null, total_minor: float, notes?: string|null}  $data
     * @return array{bill_id: int, journal_entry_id: int}
     */
    public function create(int $tenantId, array $data, ?int $userId = null): array
    {
        $total = round((float) $data['total_minor'], 2);

        if ($total <= 0) {
            throw ValidationException::withMessages(['total_minor' => __('api.expense_amount_positive')]);
        }

        $roles = $this->coding->get($tenantId)['roles'];
        $payable = (string) ($roles['ap'] ?? '2102');

        // A bill against an order that already went into stock must not debit inventory twice.
        $alreadyInStock = false;

        if (($data['purchase_order_id'] ?? null) !== null) {
            $alreadyInStock = DB::table('purchase_receipts')
                ->where('order_id', (int) $data['purchase_order_id'])
                ->where('qc_status', 'passed')
                ->exists();
        }

        $debitCode = $alreadyInStock
            ? (string) ($roles['cogs'] ?? '5101')
            : (string) ($roles['inventory'] ?? '1301');

        $description = __('api.supplier_bill_posted', ['reference' => (string) ($data['supplier_reference'] ?? $data['number'] ?? '')]);

        return DB::transaction(function () use ($tenantId, $data, $userId, $total, $payable, $debitCode, $description): array {
            $billId = (int) DB::table('supplier_invoices')->insertGetId([
                'tenant_id' => $tenantId,
                'supplier_id' => $data['supplier_id'] ?? null,
                'purchase_order_id' => $data['purchase_order_id'] ?? null,
                'number' => $data['number'] ?? null,
                'supplier_reference' => $data['supplier_reference'] ?? null,
                'issued_on' => $data['issued_on'] ?? now()->toDateString(),
                'due_on' => $data['due_on'] ?? null,
                'status' => 'open',
                'total_minor' => $total,
                'paid_minor' => 0,
                'notes' => $data['notes'] ?? null,
                'branch_id' => $data['branch_id'] ?? null,
                'created_by' => $userId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $entry = AccJournalEntry::withoutTenancy(fn (): AccJournalEntry => $this->ledger->post(
                [
                    ['code' => $debitCode, 'debit' => $total, 'description' => $description],
                    ['code' => $payable, 'credit' => $total, 'description' => $description],
                ],
                [
                    'tenant_id' => $tenantId,
                    'document_date' => $data['issued_on'] ?? now()->toDateString(),
                    'description' => $description,
                    'document_no' => $data['supplier_reference'] ?? $data['number'] ?? null,
                    'branch_id' => $data['branch_id'] ?? null,
                    'status' => 'posted',
                    'created_by' => $userId,
                ],
            ));

            DB::table('supplier_invoices')->where('id', $billId)->update([
                'journal_entry_id' => $entry->id,
                'updated_at' => now(),
            ]);

            return ['bill_id' => $billId, 'journal_entry_id' => (int) $entry->id];
        });
    }

    /**
     * Pay a bill, in full or in part.
     *
     * Part payment is the normal case in a small shop, so the bill keeps a paid figure and
     * closes only when it is covered — rather than being forced to invent a second bill for
     * the remainder.
     *
     * @return array{paid_minor: float, remaining_minor: float, status: string}
     */
    public function pay(int $tenantId, int $billId, float $amount, ?int $cashAccountId, ?int $userId = null): array
    {
        $bill = DB::table('supplier_invoices')->where('tenant_id', $tenantId)->where('id', $billId)->first();

        if ($bill === null) {
            throw ValidationException::withMessages(['bill' => __('api.supplier_bill_not_found')]);
        }

        if ((string) $bill->status !== 'open') {
            throw ValidationException::withMessages(['bill' => __('api.supplier_bill_not_open')]);
        }

        $amount = round($amount, 2);
        $remaining = round((float) $bill->total_minor - (float) $bill->paid_minor, 2);

        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount_minor' => __('api.expense_amount_positive')]);
        }

        if ($amount > $remaining + 0.01) {
            throw ValidationException::withMessages(['amount_minor' => __('api.supplier_payment_too_large')]);
        }

        $roles = $this->coding->get($tenantId)['roles'];
        $payable = (string) ($roles['ap'] ?? '2102');
        $cashCode = (string) ($roles['cash'] ?? '1102');

        if ($cashAccountId !== null) {
            $chartCode = trim((string) DB::table('acc_cash_accounts')
                ->where('tenant_id', $tenantId)->where('id', $cashAccountId)->value('chart_code'));

            $cashCode = $chartCode !== '' ? $chartCode : (string) ($roles['bank'] ?? '1103');
        }

        return DB::transaction(function () use ($tenantId, $bill, $billId, $amount, $payable, $cashCode, $userId): array {
            AccJournalEntry::withoutTenancy(fn (): AccJournalEntry => $this->ledger->post(
                [
                    ['code' => $payable, 'debit' => $amount, 'description' => __('api.supplier_bill_payment')],
                    ['code' => $cashCode, 'credit' => $amount, 'description' => __('api.supplier_bill_payment')],
                ],
                [
                    'tenant_id' => $tenantId,
                    'document_date' => now()->toDateString(),
                    'description' => __('api.supplier_bill_payment'),
                    'status' => 'posted',
                    'created_by' => $userId,
                ],
            ));

            $paid = round((float) $bill->paid_minor + $amount, 2);
            $status = $paid >= (float) $bill->total_minor - 0.01 ? 'paid' : 'open';

            DB::table('supplier_invoices')->where('id', $billId)->update([
                'paid_minor' => $paid,
                'status' => $status,
                'updated_at' => now(),
            ]);

            return [
                'paid_minor' => $paid,
                'remaining_minor' => round((float) $bill->total_minor - $paid, 2),
                'status' => $status,
            ];
        });
    }
}
