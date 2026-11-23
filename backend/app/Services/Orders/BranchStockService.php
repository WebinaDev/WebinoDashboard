<?php

namespace App\Services\Orders;

use App\Models\BranchStock;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Support\Facades\DB;

/**
 * Moves stock for one branch, and records what it could not honour.
 *
 * The rule the owner chose for offline POS: a sale is never refused because the branch's
 * cached quantity ran out. Two tills can both sell the last croissant while the network is
 * down, and by the time they sync the guest has paid and gone. So the sale is kept, the
 * quantity goes negative, and the order is stamped `stock_oversold_at` — which is what
 * turns a silent inventory drift into a list someone can act on.
 *
 * Online sales keep the strict behaviour they had before: they see the live figure, so a
 * shortfall there is a real error and is raised as one.
 */
final class BranchStockService
{
    /**
     * Apply an order's items to its branch.
     *
     * @return int number of lines that went negative
     */
    public function applyOrder(Order $order, int $sign = -1): int
    {
        $branchId = (int) ($order->branch_id ?? 0);
        if ($branchId < 1) {
            return 0; // not a branch sale (legacy row, or the tenant never enabled branches)
        }

        $oversold = 0;

        DB::transaction(function () use ($order, $branchId, $sign, &$oversold): void {
            foreach ($order->items as $item) {
                if ($this->adjust($order, $item, $branchId, $sign) < 0) {
                    $oversold++;
                }
            }
        });

        if ($oversold > 0 && $sign < 0) {
            $this->flag($order);
        }

        return $oversold;
    }

    /**
     * Set a branch's count for one item — the stock-take path.
     *
     * A count is an absolute figure, not a delta, so it is safe to replay after an outage.
     */
    public function recount(int $tenantId, int $branchId, int $productId, ?int $variantId, int $quantity): BranchStock
    {
        $row = BranchStock::query()->firstOrNew([
            'branch_id' => $branchId,
            'product_id' => $productId,
            'product_variant_id' => $variantId,
        ]);

        $row->fill([
            'tenant_id' => $tenantId,
            'quantity' => $quantity,
            'last_counted_at' => now(),
        ])->save();

        return $row;
    }

    /** The row for this item at this branch, created lazily at zero if it does not exist yet. */
    public function row(int $tenantId, int $branchId, int $productId, ?int $variantId): BranchStock
    {
        return BranchStock::query()->firstOrCreate(
            [
                'branch_id' => $branchId,
                'product_id' => $productId,
                'product_variant_id' => $variantId,
            ],
            [
                'tenant_id' => $tenantId,
                'quantity' => 0,
                'reserved_quantity' => 0,
            ],
        );
    }

    /** @return int the resulting quantity */
    private function adjust(Order $order, OrderItem $item, int $branchId, int $sign): int
    {
        $variantId = $item->product_variant_id ? (int) $item->product_variant_id : null;
        $quantity = max(1, (int) $item->quantity);

        // Create the row if needed, then move it in one statement so two tills syncing at
        // the same moment cannot both read 1 and both write 0.
        $existing = BranchStock::query()
            ->where('branch_id', $branchId)
            ->where('product_id', $item->product_id)
            ->where('product_variant_id', $variantId)
            ->lockForUpdate()
            ->first();

        if (! $existing) {
            $existing = $this->row((int) $order->tenant_id, $branchId, (int) $item->product_id, $variantId);
        }

        $delta = $sign * $quantity;

        BranchStock::query()
            ->whereKey($existing->getKey())
            ->update(['quantity' => DB::raw('quantity + ('.$delta.')')]);

        return (int) BranchStock::query()->whereKey($existing->getKey())->value('quantity');
    }

    /** Mark the sale as having gone past what the branch had. Kept separate so it is queryable. */
    private function flag(Order $order): void
    {
        if ($order->stock_oversold_at !== null) {
            return;
        }

        $order->forceFill(['stock_oversold_at' => now()])->saveQuietly();
    }
}
