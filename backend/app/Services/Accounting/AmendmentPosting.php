<?php

namespace App\Services\Accounting;

use App\Models\OrderAmendment;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Services\LedgerPosting;

/**
 * The journal for a settled amendment.
 *
 * Editing an invoice after the guest has paid is the one operation that rewrites money after the
 * fact. It was fully audited — who asked, who approved, what changed — and posted nothing, so
 * the day's sales figure and the amount in the drawer disagreed by exactly the amount of the
 * amendment, and the difference looked like a cashier's shortfall.
 *
 * Two shapes, and no third:
 *
 *   collect (the guest owes more)   Dr cash/tender        Cr sales
 *   refund  (the shop owes back)    Dr sales (returns)   Cr cash/tender
 *
 * The tenders are mapped the same way sales are, so an amendment paid by card lands in the bank
 * rather than in the drawer.
 */
final class AmendmentPosting
{
    public function __construct(
        private readonly LedgerPosting $ledger,
        private readonly AccountCoding $coding,
    ) {}

    /**
     * @return array{posted: bool, journal_entry_id: int|null, delta_minor: int}
     */
    public function post(OrderAmendment $amendment, ?int $userId = null): array
    {
        $delta = (int) $amendment->delta_minor;

        if ($delta === 0) {
            // An edit that moves no money (a corrected note, a swapped item at the same price)
            // has no entry to make.
            return ['posted' => false, 'journal_entry_id' => null, 'delta_minor' => 0];
        }

        $order = $amendment->order;

        if ($order === null) {
            return ['posted' => false, 'journal_entry_id' => null, 'delta_minor' => $delta];
        }

        $tenantId = (int) $order->tenant_id;
        $roles = $this->coding->get($tenantId)['roles'];

        $sales = (string) ($roles['sales'] ?? '4101');
        $returns = (string) ($roles['sales_returns'] ?? '4102');
        $tender = (string) $amendment->settlement_tender;
        $cashCode = $this->tenderCode($tenantId, $tender);

        $amount = abs($delta);
        $description = __('api.amendment_journal', [
            'order' => (string) $order->number,
            'direction' => $delta > 0 ? __('api.amendment_collected') : __('api.amendment_refunded'),
        ]);

        $lines = $delta > 0
            ? [
                ['code' => $cashCode, 'debit' => $amount, 'description' => $description],
                ['code' => $sales, 'credit' => $amount, 'description' => $description],
            ]
            : [
                // A refund is a return, not negative revenue: the two must stay separable on a
                // P&L, or a bad month's discounts look like they never happened.
                ['code' => $returns, 'debit' => $amount, 'description' => $description],
                ['code' => $cashCode, 'credit' => $amount, 'description' => $description],
            ];

        $entry = AccJournalEntry::withoutTenancy(fn (): AccJournalEntry => $this->ledger->post(
            $lines,
            [
                'tenant_id' => $tenantId,
                'document_date' => $amendment->settled_at ?? now(),
                'description' => $description,
                'document_no' => 'AMD-'.$amendment->id,
                'branch_id' => $order->branch_id === null ? null : (int) $order->branch_id,
                'status' => 'posted',
                'created_by' => $userId,
            ],
        ));

        // An amendment settled from a console job or a queue worker has no signed-in tenant, so
        // the entry would be stamped null and disappear from every tenant's trial balance.
        // The order already tells us whose books this is; say so explicitly.
        if ($entry->tenant_id === null) {
            $entry->forceFill(['tenant_id' => $tenantId])->save();

            foreach ($entry->lines as $line) {
                if ($line->tenant_id === null) {
                    $line->forceFill(['tenant_id' => $tenantId])->save();
                }
            }
        }

        return ['posted' => true, 'journal_entry_id' => (int) $entry->id, 'delta_minor' => $delta];
    }

    /** A tender goes to the drawer or to the bank, exactly as it does for a sale. */
    private function tenderCode(int $tenantId, string $tender): string
    {
        $coding = $this->coding->get($tenantId);

        $mapped = $coding['tenders'][$tender] ?? null;

        if (is_string($mapped) && $mapped !== '') {
            return $mapped;
        }

        return match ($tender) {
            'cash' => (string) ($coding['roles']['cash'] ?? '1102'),
            'card_to_card', 'pos_terminal', 'online', 'wallet' => (string) ($coding['roles']['bank'] ?? '1103'),
            // Buying on account is a receivable, not a tender in the drawer.
            default => (string) ($coding['roles']['ar'] ?? '1101'),
        };
    }
}
