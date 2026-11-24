<?php

namespace App\Services\Catalog;

use App\Models\Product;
use Illuminate\Support\Facades\DB;

/**
 * What a dish costs, and what its ingredients' stock does to the shop's books.
 *
 * Three jobs, deliberately in one class because they must agree with each other:
 *
 *  1. **Weighted-average cost.** When stock arrives, the average moves toward the new price by
 *     the quantity received: `(old_qty × old_avg + new_qty × new_price) / (old_qty + new_qty)`.
 *     Last-price costing looks tidier on a dashboard and lies the moment a supplier raises a
 *     price mid-week.
 *
 *  2. **Plate cost.** A recipe line says "18 g of beans, 12% waste". The plate cost is each
 *     component's average cost × quantity × (1 + waste), summed. Missing costs are reported,
 *     not counted as zero — a plate cost that is quietly 20% low makes every margin report
 *     wrong in the same direction.
 *
 *  3. **Consumption.** Selling a dish withdraws its ingredients from stock at the average
 *     cost, in the same transaction that records the sale, so stock and revenue never drift.
 *
 * Money here is minor units (the shop's convention), quantities are decimals in the
 * ingredient's own unit.
 */
final class RecipeCosting
{
    public const SUBJECT_PRODUCT = 'product';

    public const SUBJECT_ACC_PRODUCT = 'acc_product';

    public const SUBJECT_MODIFIER_OPTION = 'modifier_option';

    public const REASON_PURCHASE = 'purchase';

    public const REASON_SALE = 'sale';

    public const REASON_WASTE = 'waste';

    public const REASON_COUNT = 'count';

    public const REASON_PRODUCTION = 'production';

    public const REASON_TRANSFER_IN = 'transfer_in';

    public const REASON_TRANSFER_OUT = 'transfer_out';

    // ------------------------------------------------------------------ costs ---

    /**
     * The running cost row for a subject, created at zero if it has never been costed.
     *
     * @return array{avg_cost_minor: float, last_cost_minor: float, qty_on_hand: float, unit: ?string}
     */
    public function costFor(int $tenantId, string $subjectType, int $subjectId): array
    {
        $row = DB::table('ingredient_costs')
            ->where('tenant_id', $tenantId)
            ->where('subject_type', $subjectType)
            ->where('subject_id', $subjectId)
            ->first();

        return [
            'avg_cost_minor' => (float) ($row->avg_cost_minor ?? 0),
            'last_cost_minor' => (float) ($row->last_cost_minor ?? 0),
            'qty_on_hand' => (float) ($row->qty_on_hand ?? 0),
            'unit' => $row->unit ?? null,
        ];
    }

    /**
     * Record stock arriving and move the weighted average.
     *
     * @return array{avg_cost_minor: float, qty_on_hand: float}
     */
    public function receive(
        int $tenantId,
        string $subjectType,
        int $subjectId,
        float $quantity,
        float $unitCostMinor,
        array $meta = [],
    ): array {
        if ($quantity <= 0) {
            throw new \InvalidArgumentException('A stock receipt needs a positive quantity.');
        }

        return DB::transaction(function () use ($tenantId, $subjectType, $subjectId, $quantity, $unitCostMinor, $meta): array {
            $current = $this->costFor($tenantId, $subjectType, $subjectId);

            $oldQty = max(0.0, $current['qty_on_hand']);
            $newQty = $oldQty + $quantity;
            // The average only includes cost when a price was given: a free sample should not
            // drag the average down to zero, it should leave it alone.
            $avg = $unitCostMinor > 0
                ? (($oldQty * $current['avg_cost_minor']) + ($quantity * $unitCostMinor)) / $newQty
                : $current['avg_cost_minor'];

            DB::table('ingredient_costs')->updateOrInsert(
                ['tenant_id' => $tenantId, 'subject_type' => $subjectType, 'subject_id' => $subjectId],
                [
                    'avg_cost_minor' => round($avg, 6),
                    'last_cost_minor' => $unitCostMinor > 0 ? round($unitCostMinor, 6) : $current['last_cost_minor'],
                    'qty_on_hand' => $newQty,
                    'unit' => $meta['unit'] ?? $current['unit'],
                    'last_purchase_at' => $unitCostMinor > 0 ? now() : null,
                    'updated_at' => now(),
                    'created_at' => now(),
                ],
            );

            $this->recordMovement($tenantId, $subjectType, $subjectId, self::REASON_PURCHASE, $quantity, $unitCostMinor, $meta);

            return ['avg_cost_minor' => round($avg, 6), 'qty_on_hand' => $newQty];
        });
    }

    /**
     * Remove stock (sale, waste, transfer out) and append the movement.
     *
     * Negative stock is allowed for a sale: refusing the sale because the recipe says 18 g and
     * the shelf says 17 g would block a paying guest over a counting error. The movement
     * records the negative so the discrepancy is visible in the stock report.
     */
    public function consume(
        int $tenantId,
        string $subjectType,
        int $subjectId,
        float $quantity,
        string $reason,
        array $meta = [],
    ): float {
        if ($quantity <= 0) {
            return 0.0;
        }

        return DB::transaction(function () use ($tenantId, $subjectType, $subjectId, $quantity, $reason, $meta): float {
            $current = $this->costFor($tenantId, $subjectType, $subjectId);
            $unitCost = $current['avg_cost_minor'];

            DB::table('ingredient_costs')->updateOrInsert(
                ['tenant_id' => $tenantId, 'subject_type' => $subjectType, 'subject_id' => $subjectId],
                [
                    'qty_on_hand' => $current['qty_on_hand'] - $quantity,
                    'updated_at' => now(),
                    'created_at' => now(),
                ],
            );

            $this->recordMovement($tenantId, $subjectType, $subjectId, $reason, -$quantity, $unitCost, $meta);

            return round($unitCost * $quantity, 4);
        });
    }

    /** A physical count: set the quantity, record the difference as a movement, not a new truth. */
    public function adjustToCount(int $tenantId, string $subjectType, int $subjectId, float $countedQty, array $meta = []): array
    {
        $current = $this->costFor($tenantId, $subjectType, $subjectId);
        $delta = $countedQty - $current['qty_on_hand'];

        if (abs($delta) > 0.00005) {
            $this->recordMovement($tenantId, $subjectType, $subjectId, self::REASON_COUNT, $delta, $current['avg_cost_minor'], $meta);
        }

        DB::table('ingredient_costs')->updateOrInsert(
            ['tenant_id' => $tenantId, 'subject_type' => $subjectType, 'subject_id' => $subjectId],
            ['qty_on_hand' => $countedQty, 'updated_at' => now(), 'created_at' => now()],
        );

        return ['delta' => round($delta, 4), 'qty_on_hand' => $countedQty];
    }

    // ----------------------------------------------------------------- recipes ---

    /**
     * Roll a subject's recipe into a unit cost.
     *
     * @return array{
     *   unit_cost_minor: float,
     *   lines: list<array<string, mixed>>,
     *   missing: list<string>,
     *   complete: bool
     * }
     */
    public function plateCost(int $tenantId, string $subjectType, int $subjectId): array
    {
        $lines = DB::table('recipe_lines')
            ->where('tenant_id', $tenantId)
            ->where('subject_type', $subjectType)
            ->where('subject_id', $subjectId)
            ->orderBy('sort_order')
            ->get();

        $total = 0.0;
        $missing = [];
        $rows = [];

        foreach ($lines as $line) {
            $quantity = (float) $line->quantity * (1 + ((float) $line->waste_percent / 100));
            $cost = $this->componentCost($tenantId, (string) $line->component_type, (int) $line->component_id);

            if ($cost === null) {
                // Unknown cost is reported, never silently counted as free.
                $missing[] = (string) $line->component_type.':'.$line->component_id;
                $unitCost = 0.0;
            } else {
                $unitCost = $cost;
            }

            $lineCost = $quantity * $unitCost;
            $total += $lineCost;

            $rows[] = [
                'id' => $line->id,
                'component_type' => $line->component_type,
                'component_id' => $line->component_id,
                'quantity' => (float) $line->quantity,
                'waste_percent' => (float) $line->waste_percent,
                'effective_quantity' => round($quantity, 4),
                'unit' => $line->unit,
                'unit_cost_minor' => round($unitCost, 6),
                'line_cost_minor' => round($lineCost, 4),
                'cost_known' => $cost !== null,
            ];
        }

        return [
            'unit_cost_minor' => round($total, 4),
            'lines' => $rows,
            'missing' => $missing,
            'complete' => $missing === [],
        ];
    }

    /**
     * Average cost of one component, in its own unit.
     *
     * A product with no cost row falls back to its hand-typed `purchase_price_minor`, flagged
     * as estimated. That is the honest answer for a shop that has not started tracking stock
     * yet: a real number with a caveat, instead of a fake zero.
     */
    private function componentCost(int $tenantId, string $componentType, int $componentId): ?float
    {
        if ($componentType === self::SUBJECT_MODIFIER_OPTION) {
            // An add-on's own recipe, costed the same way, plus its hand-set price if it has
            // no recipe at all (an extra sauce at a fixed 5,000).
            $sub = $this->plateCost($tenantId, self::SUBJECT_MODIFIER_OPTION, $componentId);
            if ($sub['lines'] !== []) {
                return $sub['unit_cost_minor'];
            }

            $price = DB::table('product_modifier_options')->where('id', $componentId)->value('price_minor');

            return $price === null ? null : (float) $price;
        }

        $cost = $this->costFor($tenantId, $componentType, $componentId);

        if ($cost['avg_cost_minor'] > 0) {
            return $cost['avg_cost_minor'];
        }

        if ($componentType === self::SUBJECT_PRODUCT) {
            $purchase = DB::table('products')->where('tenant_id', $tenantId)->where('id', $componentId)->value('purchase_price_minor');
        } else {
            $purchase = DB::table('acc_products')->where('tenant_id', $tenantId)->where('id', $componentId)->value('buy_price');
        }

        return $purchase === null ? null : (float) $purchase;
    }

    // -------------------------------------------------------------- consumption ---

    /**
     * Withdraw one order line's ingredients and freeze the line's cost.
     *
     * Called for every sold line. Returns the unit cost so the caller can store it on the order
     * item, which is what COGS posting and the margin reports read.
     *
     * @return array{unit_cost_minor: float, total_cost_minor: float, complete: bool}
     */
    public function consumeOrderLine(int $tenantId, int $orderItemId, int $orderId, int $productId, float $quantity): array
    {
        $cost = $this->plateCost($tenantId, self::SUBJECT_PRODUCT, $productId);

        $lines = $cost['lines'];
        $complete = $cost['complete'];

        // The add-ons the guest actually chose.
        //
        // The old code skipped modifier lines outright, so a latte with oat milk withdrew the
        // beans and the milk but not the oat milk — the exact case where stock drift is
        // noticeable, because oat milk is expensive and the till sells a lot of it. Each chosen
        // add-on whose recipe has real lines is consumed, folded into the frozen breakdown (so
        // a refund returns it), and added to the line's cost.
        $modifierUnitCost = 0.0;
        $modifiers = DB::table('order_item_modifiers')
            ->where('order_item_id', $orderItemId)
            ->whereNotNull('modifier_option_id')
            ->get(['modifier_option_id', 'quantity']);

        foreach ($modifiers as $modifier) {
            $modifierId = (int) $modifier->modifier_option_id;
            $modifierQty = max(1, (int) ($modifier->quantity ?? 1));

            $sub = $this->plateCost($tenantId, self::SUBJECT_MODIFIER_OPTION, $modifierId);

            if ($sub['lines'] === []) {
                // An add-on with no recipe (a bottled drink, a sauce bought by the case) has no
                // stock to move. Charging its *price* as cost would inflate COGS badly, so it
                // contributes nothing here — the ingredient rows are the truth.
                continue;
            }

            $complete = $complete && $sub['complete'];
            $modifierUnitCost += $sub['unit_cost_minor'] * $modifierQty;

            foreach ($sub['lines'] as $line) {
                if (! $line['cost_known']) {
                    continue;
                }
                $componentType = (string) $line['component_type'];
                if ($componentType === self::SUBJECT_MODIFIER_OPTION) {
                    continue;
                }

                $lines[] = array_merge($line, [
                    'component_type' => $componentType,
                    'effective_quantity' => round((float) $line['effective_quantity'] * $modifierQty, 4),
                    'from_modifier' => $modifierId,
                ]);
            }
        }

        foreach ($lines as $line) {
            if (! $line['cost_known']) {
                continue;
            }
            $componentType = (string) $line['component_type'];
            if ($componentType === self::SUBJECT_MODIFIER_OPTION) {
                continue;
            }
            $this->consume(
                $tenantId,
                $componentType,
                (int) $line['component_id'],
                (float) $line['effective_quantity'] * $quantity,
                self::REASON_SALE,
                ['reference_type' => 'order', 'reference_id' => $orderId],
            );
        }

        // Bought-in dishes (a bought cake) have no recipe: fall back to the item's own cost.
        $unitCost = $cost['lines'] !== [] || $modifierUnitCost > 0
            ? round($cost['unit_cost_minor'] + $modifierUnitCost, 4)
            : (float) (DB::table('products')->where('tenant_id', $tenantId)->where('id', $productId)->value('purchase_price_minor') ?? 0);

        $total = round($unitCost * $quantity, 4);

        DB::table('order_item_ingredient_costs')->updateOrInsert(
            ['order_item_id' => $orderItemId],
            [
                'tenant_id' => $tenantId,
                'order_id' => $orderId,
                'unit_cost_minor' => round($unitCost, 4),
                'quantity' => $quantity,
                'total_cost_minor' => $total,
                'complete' => $complete,
                'breakdown' => json_encode($lines, JSON_UNESCAPED_UNICODE),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );

        return ['unit_cost_minor' => $unitCost, 'total_cost_minor' => $total, 'complete' => $complete];
    }

    /**
     * Cost of goods sold for a period, from the frozen line costs.
     *
     * The number a real P&L needs. It reads the frozen table rather than recomputing recipes,
     * so last month's margin does not move when a supplier changes a price today.
     *
     * @return array{cogs_minor: float, lines: int, incomplete_lines: int}
     */
    public function cogsFor(int $tenantId, \DateTimeInterface $from, \DateTimeInterface $to): array
    {
        $row = DB::table('order_item_ingredient_costs as c')
            ->join('orders as o', 'c.order_id', '=', 'o.id')
            ->where('c.tenant_id', $tenantId)
            ->whereBetween('o.created_at', [$from, $to])
            ->whereNotIn('o.status', ['cancelled', 'refunded', 'failed', 'pending_payment'])
            ->selectRaw('COALESCE(SUM(c.total_cost_minor), 0) as cogs')
            ->selectRaw('COUNT(*) as lines')
            ->selectRaw('COALESCE(SUM(CASE WHEN c.complete = 0 THEN 1 ELSE 0 END), 0) as incomplete')
            ->first();

        return [
            'cogs_minor' => round((float) ($row->cogs ?? 0), 4),
            'lines' => (int) ($row->lines ?? 0),
            'incomplete_lines' => (int) ($row->incomplete ?? 0),
        ];
    }

    /**
     * Recalculate a product's rolled-up cost after its recipe changes.
     *
     * Keeps `products.purchase_price_minor` in step so the existing pricing screens and COGS
     * posting — which read that column — start using the recipe figure.
     */
    public function syncProductCost(int $tenantId, int $productId): float
    {
        $cost = $this->plateCost($tenantId, self::SUBJECT_PRODUCT, $productId);

        if ($cost['lines'] === [] || ! $cost['complete']) {
            // Do not overwrite a hand-typed cost with a partial roll-up: an incomplete recipe
            // would understate the cost and every margin built on it.
            return $cost['unit_cost_minor'];
        }

        Product::query()
            ->where('tenant_id', $tenantId)
            ->whereKey($productId)
            ->update([
                'purchase_price_minor' => (int) round($cost['unit_cost_minor']),
                'cost_is_estimated' => false,
            ]);

        return $cost['unit_cost_minor'];
    }

    /**
     * Move stock from one store to another.
     *
     * Two rows, not one: a transfer is a departure and an arrival, and a single signed row
     * cannot say which store lost the goods. Both carry the same reference so the pair is
     * reconstructible, and the value is the average cost at the moment of the move — the
     * receiving store should not inherit a cost the sending store never paid.
     */
    public function transfer(
        int $tenantId,
        string $subjectType,
        int $subjectId,
        ?int $fromWarehouseId,
        ?int $toWarehouseId,
        float $quantity,
        array $meta = [],
    ): array {
        if ($quantity <= 0) {
            throw new \InvalidArgumentException('A transfer needs a positive quantity.');
        }

        if ($fromWarehouseId === $toWarehouseId) {
            throw new \InvalidArgumentException('A transfer between the same store is not a movement.');
        }

        $cost = $this->costFor($tenantId, $subjectType, $subjectId);

        if ($cost['qty_on_hand'] < $quantity) {
            // Unlike a sale, a transfer can wait: nothing is being served, and moving stock the
            // store does not have would invent it in one place and destroy it in another.
            throw \Illuminate\Validation\ValidationException::withMessages([
                'quantity' => __('api.stock_transfer_exceeds_on_hand'),
            ]);
        }

        // Both rows or neither: a departure without an arrival is stock that vanished.
        return DB::transaction(function () use ($tenantId, $subjectType, $subjectId, $fromWarehouseId, $toWarehouseId, $quantity, $meta, $cost): array {
            $this->consume($tenantId, $subjectType, $subjectId, $quantity, self::REASON_TRANSFER_OUT, array_merge($meta, [
                'warehouse_id' => $fromWarehouseId,
                'counterpart_warehouse_id' => $toWarehouseId,
            ]));

            // The total on hand does not change in a transfer; only where it sits does.
            DB::table('ingredient_costs')
                ->where('tenant_id', $tenantId)
                ->where('subject_type', $subjectType)
                ->where('subject_id', $subjectId)
                ->update([
                    'qty_on_hand' => DB::raw('qty_on_hand + '.round($quantity, 4)),
                    'updated_at' => now(),
                ]);

            $this->recordMovement($tenantId, $subjectType, $subjectId, self::REASON_TRANSFER_IN, $quantity, $cost['avg_cost_minor'], array_merge($meta, [
                'warehouse_id' => $toWarehouseId,
                'counterpart_warehouse_id' => $fromWarehouseId,
            ]));

            return [
                'quantity' => $quantity,
                'unit_cost_minor' => $cost['avg_cost_minor'],
                'value_minor' => round($quantity * $cost['avg_cost_minor'], 4),
            ];
        });
    }

    /**
     * @param  array{reference_type?: string|null, reference_id?: int|null, note?: string|null, unit?: string|null, moved_at?: mixed, created_by?: int|null, warehouse_id?: int|null, batch_id?: int|null, counterpart_warehouse_id?: int|null}  $meta
     */
    private function recordMovement(
        int $tenantId,
        string $subjectType,
        int $subjectId,
        string $reason,
        float $signedQuantity,
        float $unitCostMinor,
        array $meta = [],
    ): void {
        DB::table('stock_movements')->insert([
            'tenant_id' => $tenantId,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'reason' => $reason,
            // Only waste carries a kind; a sale with a "spoilage" label would be nonsense.
            'waste_kind' => $reason === self::REASON_WASTE ? ($meta['waste_kind'] ?? null) : null,
            'quantity' => round($signedQuantity, 4),
            'unit_cost_minor' => round($unitCostMinor, 6),
            'value_minor' => round($signedQuantity * $unitCostMinor, 4),
            'reference_type' => $meta['reference_type'] ?? null,
            'reference_id' => $meta['reference_id'] ?? null,
            'warehouse_id' => $meta['warehouse_id'] ?? null,
            'batch_id' => $meta['batch_id'] ?? null,
            'counterpart_warehouse_id' => $meta['counterpart_warehouse_id'] ?? null,
            'note' => $meta['note'] ?? null,
            'created_by' => $meta['created_by'] ?? (auth()->id() ?? null),
            'moved_at' => $meta['moved_at'] ?? now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
