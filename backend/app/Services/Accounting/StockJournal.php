<?php

namespace App\Services\Accounting;

use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Services\LedgerPosting;

/**
 * Stock movements, as journal entries.
 *
 * The inventory was moving and the books were not. Receiving goods through the warehouse
 * screens changed a quantity and posted nothing, so a shop's stock could be worth millions on
 * one report and the ledger could show a supplier balance of zero — the goods had arrived from
 * nowhere and been paid for by nobody.
 *
 * Each movement is posted at the value the ledger already knows: the weighted average the cost
 * engine carried at the moment of the move, not the current one. Re-costing last month's
 * spoilage at this month's price would move the P&L of a closed month.
 *
 * Shape:
 *
 *   receipt  (goods in)     Dr inventory        Cr accounts payable
 *   waste    (goods out)    Dr cost of sales    Cr inventory
 *   shortage (count down)   Dr cost of sales    Cr inventory
 *   surplus  (count up)     Dr inventory        Cr cost of sales
 *
 * A zero-value movement posts nothing: a free sample has no entry to make, and a zero journal
 * only makes the ledger harder to read.
 */
final class StockJournal
{
    public function __construct(
        private readonly LedgerPosting $ledger,
        private readonly AccountCoding $coding,
    ) {}

    /** @return array{posted: bool, value_minor: float, entry_id?: int} */
    public function receive(int $tenantId, float $valueMinor, array $meta = []): array
    {
        return $this->post($tenantId, 'inventory_in', $valueMinor, $meta);
    }

    /** @return array{posted: bool, value_minor: float, entry_id?: int} */
    public function issue(int $tenantId, float $valueMinor, array $meta = []): array
    {
        return $this->post($tenantId, 'inventory_out', $valueMinor, $meta);
    }

    /**
     * @param  array{reference?: string|null, description?: string|null, document_date?: mixed}  $meta
     * @return array{posted: bool, value_minor: float, entry_id?: int}
     */
    private function post(int $tenantId, string $direction, float $valueMinor, array $meta): array
    {
        $value = round(abs($valueMinor), 2);

        if ($value < 0.01) {
            return ['posted' => false, 'value_minor' => 0.0];
        }

        $roles = $this->coding->get($tenantId)['roles'];
        $inventory = (string) ($roles['inventory'] ?? '1301');
        $counterpart = $direction === 'inventory_in'
            ? (string) ($roles['ap'] ?? '2102')
            : (string) ($roles['cogs'] ?? '5101');

        // `creating` on the acc_* models refuses a row whose tenant is not the signed-in
        // tenant, which is the guard that stops a background job posting into another shop's
        // books. A stock movement raised from a scheduled command has no signed-in user, so the
        // write runs with tenancy off and the tenant passed explicitly — the one place that is
        // correct, because the tenant comes from the movement, not from the session.
        $entry = AccJournalEntry::withoutTenancy(fn (): AccJournalEntry => $this->ledger->post(
            $direction === 'inventory_in'
                ? [
                    ['code' => $inventory, 'debit' => $value, 'description' => $meta['description'] ?? null],
                    ['code' => $counterpart, 'credit' => $value, 'description' => $meta['description'] ?? null],
                ]
                : [
                    ['code' => $counterpart, 'debit' => $value, 'description' => $meta['description'] ?? null],
                    ['code' => $inventory, 'credit' => $value, 'description' => $meta['description'] ?? null],
                ],
            [
                'tenant_id' => $tenantId,
                'document_date' => $meta['document_date'] ?? now(),
                'description' => $meta['description'] ?? ($direction === 'inventory_in' ? 'ورود کالا به انبار' : 'خروج کالا از انبار'),
                'document_no' => $meta['reference'] ?? null,
                'status' => 'posted',
            ],
        ));

        return ['posted' => true, 'value_minor' => $value, 'entry_id' => (int) $entry->id];
    }

    /**
     * The value of a set of movements, in minor units.
     *
     * Reads the stored `value_minor` on the ledger rather than recomputing: that column is what
     * the movement was worth when it happened, which is the whole point of keeping it.
     */
    public function valueOfMovements(array $movementIds): float
    {
        if ($movementIds === []) {
            return 0.0;
        }

        return (float) DB::table('stock_movements')->whereIn('id', $movementIds)->sum('value_minor');
    }
}
