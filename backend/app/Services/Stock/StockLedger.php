<?php

namespace App\Services\Stock;

use App\Services\Accounting\StockJournal;
use App\Services\Catalog\RecipeCosting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The stock ledger: one place every movement goes through, and every movement the books see.
 *
 * Before this, stock lived in two tables that disagreed and neither posted a journal, so a
 * shop could have stock worth millions on one screen, a supplier balance of zero on another,
 * and no way to tell which was right.
 *
 * Every method here:
 *  - writes through {@see RecipeCosting}, which owns the weighted average and appends the
 *    movement (append-only — the ledger is never edited, only added to);
 *  - posts the value to the accounting ledger at the moment's own cost, so the inventory
 *    account on the balance sheet is the sum of the movements rather than a separate opinion;
 *  - keeps `acc_warehouse_stock` in step, because the accounting screens read it and a cache
 *    that drifts is worse than no cache.
 *
 * Quantities are in the item's base unit throughout.
 */
final class StockLedger
{
    public function __construct(
        private readonly RecipeCosting $costing,
        private readonly StockJournal $journal,
    ) {}

    /**
     * Goods arriving: a purchase receipt, an opening balance, or a production run.
     *
     * @param  array{warehouse_id?: int|null, batch_no?: string|null, expires_on?: string|null, slot?: string|null, reference_type?: string|null, reference_id?: int|null, note?: string|null, unit?: string|null, document_date?: mixed}  $meta
     * @return array{value_minor: float, journal_entry_id: int|null, movement_id: int|null}
     */
    public function receive(
        int $tenantId,
        int $productId,
        float $quantity,
        float $unitCostMinor,
        array $meta = [],
    ): array {
        if ($quantity <= 0) {
            throw new \InvalidArgumentException('A stock receipt needs a positive quantity.');
        }

        return DB::transaction(function () use ($tenantId, $productId, $quantity, $unitCostMinor, $meta): array {
            $before = (int) DB::table('stock_movements')->max('id');

            $this->costing->receive(
                $tenantId,
                RecipeCosting::SUBJECT_ACC_PRODUCT,
                $productId,
                $quantity,
                $unitCostMinor,
                $meta,
            );

            $movementId = DB::table('stock_movements')->where('id', '>', $before)->max('id');

            // The batch is optional: a shop that does not track lots should not be forced to
            // type a number to receive bread. If they do track it, the quantity lands there.
            if (($meta['batch_no'] ?? null) !== null && (string) $meta['batch_no'] !== '') {
                $this->addToBatch($tenantId, $productId, $quantity, $unitCostMinor, $meta);
            }

            $this->syncWarehouseCache($tenantId, $productId);

            $value = round($quantity * $unitCostMinor, 4);

            $posted = $this->journal->receive($tenantId, $value, [
                'reference' => $meta['reference_type'] ?? null,
                'document_date' => $meta['document_date'] ?? null,
                'description' => $meta['note'] ?? null,
            ]);

            return [
                'value_minor' => $value,
                'journal_entry_id' => $posted['entry_id'] ?? null,
                'movement_id' => $movementId === null ? null : (int) $movementId,
            ];
        });
    }

    /**
     * Goods leaving for a reason that is not a sale: waste, spoilage, staff meal.
     *
     * A reason is mandatory all the way down. Unexplained shrinkage is the one number a stock
     * report must never silently produce.
     *
     * @param  array{warehouse_id?: int|null, batch_no?: string|null, note?: string|null, reference_type?: string|null, reference_id?: int|null, document_date?: mixed}  $meta
     * @return array{value_minor: float, journal_entry_id: int|null}
     */
    public function issue(
        int $tenantId,
        int $productId,
        float $quantity,
        string $reason,
        array $meta = [],
    ): array {
        $trimmed = trim($reason);

        if ($trimmed === '') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'reason' => __('api.stock_reason_required'),
            ]);
        }

        return DB::transaction(function () use ($tenantId, $productId, $quantity, $trimmed, $meta): array {
            $note = trim($trimmed.' — '.((string) ($meta['note'] ?? '')));

            $value = $this->costing->consume(
                $tenantId,
                RecipeCosting::SUBJECT_ACC_PRODUCT,
                $productId,
                $quantity,
                RecipeCosting::REASON_WASTE,
                array_merge($meta, ['note' => $note]),
            );

            if (($meta['batch_no'] ?? null) !== null && (string) $meta['batch_no'] !== '') {
                $this->takeFromBatch($tenantId, $productId, $quantity, (string) $meta['batch_no']);
            }

            $this->syncWarehouseCache($tenantId, $productId);

            $posted = $this->journal->issue($tenantId, $value, [
                'reference' => $meta['reference_type'] ?? null,
                'document_date' => $meta['document_date'] ?? null,
                'description' => $trimmed,
            ]);

            return ['value_minor' => $value, 'journal_entry_id' => $posted['entry_id'] ?? null];
        });
    }

    /**
     * A physical count.
     *
     * The difference posts, not the whole quantity: counting fifty of something you already
     * had fifty of is not a stock movement and must not appear in the books as one.
     *
     * @return array{delta: float, value_minor: float, journal_entry_id: int|null}
     */
    public function count(int $tenantId, int $productId, float $countedQuantity, array $meta = []): array
    {
        return DB::transaction(function () use ($tenantId, $productId, $countedQuantity, $meta): array {
            $before = $this->costing->costFor($tenantId, RecipeCosting::SUBJECT_ACC_PRODUCT, $productId);

            $result = $this->costing->adjustToCount(
                $tenantId,
                RecipeCosting::SUBJECT_ACC_PRODUCT,
                $productId,
                $countedQuantity,
                $meta,
            );

            $this->syncWarehouseCache($tenantId, $productId);

            $value = round($result['delta'] * $before['avg_cost_minor'], 4);

            // A positive delta is stock found; negative is stock lost.
            $posted = $value >= 0
                ? $this->journal->receive($tenantId, $value, ['description' => $meta['note'] ?? 'مازاد انبار'])
                : $this->journal->issue($tenantId, $value, ['description' => $meta['note'] ?? 'کسری انبار']);

            return [
                'delta' => $result['delta'],
                'value_minor' => $value,
                'journal_entry_id' => $posted['entry_id'] ?? null,
            ];
        });
    }

    /** Between stores. No journal: stock moved, value did not. */
    public function transfer(
        int $tenantId,
        int $productId,
        ?int $fromWarehouseId,
        ?int $toWarehouseId,
        float $quantity,
        array $meta = [],
    ): array {
        return DB::transaction(function () use ($tenantId, $productId, $fromWarehouseId, $toWarehouseId, $quantity, $meta): array {
            $result = $this->costing->transfer(
                $tenantId,
                RecipeCosting::SUBJECT_ACC_PRODUCT,
                $productId,
                $fromWarehouseId,
                $toWarehouseId,
                $quantity,
                $meta,
            );

            $this->syncWarehouseCache($tenantId, $productId);

            return $result;
        });
    }

    /**
     * Make the accounting module's stock table agree with the ledger.
     *
     * `acc_warehouse_stock` is keyed by warehouse and product; the ledger's per-warehouse rows
     * are summed for that product and written back. Without a warehouse id the item is put in
     * the tenant's default store, which is where the accounting screens look for it.
     */
    private function syncWarehouseCache(int $tenantId, int $productId): void
    {
        if (! DB::getSchemaBuilder()->hasTable('acc_warehouse_stock')) {
            return;
        }

        $perWarehouse = DB::table('stock_movements')
            ->where('tenant_id', $tenantId)
            ->where('subject_type', RecipeCosting::SUBJECT_ACC_PRODUCT)
            ->where('subject_id', $productId)
            ->selectRaw('warehouse_id, COALESCE(SUM(quantity),0) as qty')
            ->groupBy('warehouse_id')
            ->get();

        $defaultWarehouse = DB::table('acc_warehouses')
            ->where('tenant_id', $tenantId)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->value('id');

        $totals = [];

        foreach ($perWarehouse as $row) {
            $warehouseId = $row->warehouse_id !== null ? (int) $row->warehouse_id : (int) $defaultWarehouse;
            if ($warehouseId === 0) {
                continue;
            }
            $totals[$warehouseId] = ($totals[$warehouseId] ?? 0.0) + (float) $row->qty;
        }

        foreach ($totals as $warehouseId => $quantity) {
            DB::table('acc_warehouse_stock')->updateOrInsert(
                ['warehouse_id' => $warehouseId, 'product_id' => $productId],
                ['tenant_id' => $tenantId, 'quantity' => round($quantity, 4), 'updated_at' => now(), 'created_at' => now()],
            );
        }
    }

    private function addToBatch(int $tenantId, int $productId, float $quantity, float $unitCostMinor, array $meta): void
    {
        $existing = DB::table('stock_batches')
            ->where('tenant_id', $tenantId)
            ->where('subject_type', RecipeCosting::SUBJECT_ACC_PRODUCT)
            ->where('subject_id', $productId)
            ->where('batch_no', (string) $meta['batch_no'])
            ->where('warehouse_id', $meta['warehouse_id'] ?? null)
            ->first();

        if ($existing !== null) {
            DB::table('stock_batches')->where('id', $existing->id)->update([
                'quantity' => (float) $existing->quantity + $quantity,
                'updated_at' => now(),
            ]);

            return;
        }

        DB::table('stock_batches')->insert([
            'tenant_id' => $tenantId,
            'warehouse_id' => $meta['warehouse_id'] ?? null,
            'subject_type' => RecipeCosting::SUBJECT_ACC_PRODUCT,
            'subject_id' => $productId,
            'batch_no' => (string) $meta['batch_no'],
            'slot' => $meta['slot'] ?? null,
            'expires_on' => $meta['expires_on'] ?? null,
            'quantity' => $quantity,
            'unit_cost_minor' => $unitCostMinor,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function takeFromBatch(int $tenantId, int $productId, float $quantity, string $batchNo): void
    {
        $batch = DB::table('stock_batches')
            ->where('tenant_id', $tenantId)
            ->where('subject_type', RecipeCosting::SUBJECT_ACC_PRODUCT)
            ->where('subject_id', $productId)
            ->where('batch_no', $batchNo)
            ->orderBy('expires_on')
            ->first();

        if ($batch === null) {
            return;
        }

        DB::table('stock_batches')->where('id', $batch->id)->update([
            'quantity' => max(0, (float) $batch->quantity - $quantity),
            'updated_at' => now(),
        ]);
    }

    /**
     * What is about to expire, soonest first.
     *
     * The report that makes lots worth recording: without it, expiry is discovered by smell.
     *
     * @return list<array<string, mixed>>
     */
    public function expiring(int $tenantId, int $days = 7): array
    {
        $until = Carbon::now()->addDays($days)->toDateString();

        return DB::table('stock_batches as b')
            ->leftJoin('acc_products as p', 'b.subject_id', '=', 'p.id')
            ->where('b.tenant_id', $tenantId)
            ->whereNotNull('b.expires_on')
            ->where('b.expires_on', '<=', $until)
            ->where('b.quantity', '>', 0)
            ->orderBy('b.expires_on')
            ->get([
                'b.id', 'b.batch_no', 'b.expires_on', 'b.quantity', 'b.slot', 'b.warehouse_id',
                'p.name as product_name', 'p.base_unit',
            ])
            ->map(fn ($row): array => [
                'batch_id' => (int) $row->id,
                'batch_no' => $row->batch_no,
                'product_name' => $row->product_name,
                'quantity' => (float) $row->quantity,
                'unit' => $row->base_unit,
                'expires_on' => $row->expires_on,
                'days_left' => (int) Carbon::now()->startOfDay()->diffInDays(Carbon::parse((string) $row->expires_on), false),
                'slot' => $row->slot,
                'warehouse_id' => $row->warehouse_id,
                'expired' => (string) $row->expires_on < Carbon::now()->toDateString(),
            ])
            ->values()
            ->all();
    }

    /**
     * What to buy, from the reorder points the shop already set.
     *
     * `reorder_point` has been stored since the warehouse screens were written and nothing ever
     * read it. This is the engine that turns it into a shopping list — ordered by how far below
     * the line each item is, because that is the order a buyer should act in.
     *
     * @return list<array<string, mixed>>
     */
    public function reorderSuggestions(int $tenantId): array
    {
        $rows = DB::table('ingredient_costs as ic')
            ->join('acc_products as p', function ($join): void {
                $join->on('p.id', '=', 'ic.subject_id')->where('ic.subject_type', '=', RecipeCosting::SUBJECT_ACC_PRODUCT);
            })
            ->leftJoin('acc_warehouse_stock as ws', 'ws.product_id', '=', 'ic.subject_id')
            ->where('ic.tenant_id', $tenantId)
            ->where('p.inventory_controlled', true)
            ->groupBy('p.id', 'p.name', 'p.base_unit', 'p.purchase_unit', 'p.pack_size', 'ic.avg_cost_minor', 'ic.qty_on_hand')
            ->selectRaw('p.id, p.name, p.base_unit, p.purchase_unit, p.pack_size, ic.avg_cost_minor, ic.qty_on_hand, MAX(ws.reorder_point) as reorder_point')
            ->get();

        $suggestions = [];

        foreach ($rows as $row) {
            $reorder = (float) ($row->reorder_point ?? 0);
            $onHand = (float) $row->qty_on_hand;

            if ($reorder <= 0 || $onHand >= $reorder) {
                continue;
            }

            // Buy back to twice the reorder point: restocking to exactly the trigger means
            // ordering again the day after delivery.
            $needed = round($reorder * 2 - $onHand, 4);
            $pack = max(0.0001, (float) ($row->pack_size ?? 1));
            $packs = (int) ceil($needed / $pack);

            $suggestions[] = [
                'product_id' => (int) $row->id,
                'name' => $row->name,
                'on_hand' => $onHand,
                'reorder_point' => $reorder,
                'shortfall' => round($reorder - $onHand, 4),
                'suggested_quantity' => round($packs * $pack, 4),
                'purchase_unit' => $row->purchase_unit,
                'packs' => $packs,
                'unit_cost_minor' => (float) $row->avg_cost_minor,
                'estimated_cost_minor' => round($packs * $pack * (float) $row->avg_cost_minor, 2),
            ];
        }

        usort($suggestions, fn (array $a, array $b): int => $b['shortfall'] <=> $a['shortfall']);

        return $suggestions;
    }
}
