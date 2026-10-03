<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Decrements stock when an order becomes a confirmed sale and restores it when that sale is undone.
 * Cafe table orders count once they are created as processing (confirmed).
 */
final class OrderStock
{
    public function sync(Order $order, ?string $from, string $to): void
    {
        $sales = \App\Services\Reports\OrderReports::salesStatuses();
        $was = $from !== null && in_array($from, $sales, true);
        $now = in_array($to, $sales, true);
        if (! $was && $now) {
            $this->reduce($order);

            return;
        }
        if ($was && ! $now) {
            $this->restoreOutstanding($order);
        }
    }

    /**
     * Lock product and variant rows and reject a cart that would oversell.
     *
     * @param  iterable<int, object>  $lines
     */
    public function assertLinesAvailable(iterable $lines): void
    {
        $totals = [];
        foreach ($lines as $line) {
            $pid = (int) ($line->product_id ?? 0);
            $vid = (int) ($line->product_variant_id ?? 0);
            if ($pid < 1) {
                continue;
            }
            $key = $vid.'-'.$pid;
            $totals[$key]['qty'] = ($totals[$key]['qty'] ?? 0) + max(0, (int) ($line->quantity ?? 0));
            $totals[$key]['product_id'] = $pid;
            $totals[$key]['variant_id'] = $vid > 0 ? $vid : null;
        }
        foreach ($totals as $row) {
            $this->assertAvailable((int) $row['product_id'], $row['variant_id'], (int) $row['qty']);
        }
    }

    public function assertAvailable(int $productId, ?int $variantId, int $qty): void
    {
        if ($qty < 1) {
            return;
        }
        if ($variantId) {
            $variant = ProductVariant::query()->whereKey($variantId)->lockForUpdate()->first();
            if ($variant && $variant->manage_stock) {
                if ((int) $variant->stock < $qty) {
                    throw ValidationException::withMessages(['stock' => 'Not enough stock.']);
                }

                return;
            }
        }
        $product = Product::query()->whereKey($productId)->lockForUpdate()->first();
        if ($product && $product->manage_stock && (int) $product->stock < $qty) {
            throw ValidationException::withMessages(['stock' => 'Not enough stock.']);
        }
    }

    public function reduce(Order $order): void
    {
        $order->loadMissing('items');
        $meta = is_array($order->meta) ? $order->meta : [];
        if (! empty($meta['stock_reduced'])) {
            return;
        }
        $lines = [];
        foreach ($order->items as $item) {
            $qty = max(0, (int) $item->quantity);
            if ($qty < 1 || ! $item->product_id) {
                continue;
            }
            if ($this->adjust($item, -$qty)) {
                $lines[(string) $item->id] = $qty;
            }
        }
        $meta['stock_reduced'] = $lines !== [];
        $meta['stock_reduced_qty'] = $lines;
        $meta['stock_restored_qty'] = is_array($meta['stock_restored_qty'] ?? null) ? $meta['stock_restored_qty'] : [];
        $meta['marketplace_stock_reduced'] = $lines !== [];
        $order->meta = $meta;
        $order->saveQuietly();
    }

    public function restoreOutstanding(Order $order): void
    {
        $order->loadMissing('items');
        $meta = is_array($order->meta) ? $order->meta : [];
        if (empty($meta['stock_reduced']) && empty($meta['marketplace_stock_reduced'])) {
            return;
        }
        $reduced = is_array($meta['stock_reduced_qty'] ?? null) ? $meta['stock_reduced_qty'] : [];
        $restored = is_array($meta['stock_restored_qty'] ?? null) ? $meta['stock_restored_qty'] : [];
        foreach ($order->items as $item) {
            $key = (string) $item->id;
            $taken = (int) ($reduced[$key] ?? $item->quantity);
            $done = (int) ($restored[$key] ?? 0);
            $left = $taken - $done;
            if ($left > 0 && $item->product_id && $this->adjust($item, $left)) {
                $restored[$key] = $done + $left;
            }
        }
        $meta['stock_restored_qty'] = $restored;
        $meta['stock_reduced'] = false;
        $meta['marketplace_stock_reduced'] = false;
        $order->meta = $meta;
        $order->saveQuietly();
    }

    /**
     * @param  list<array<string, mixed>>|null  $items
     */
    public function restoreReturned(Order $order, ?array $items): void
    {
        if ($items === null || $items === []) {
            return;
        }
        $order->loadMissing('items');
        $meta = is_array($order->meta) ? $order->meta : [];
        $reduced = is_array($meta['stock_reduced_qty'] ?? null) ? $meta['stock_reduced_qty'] : [];
        $restored = is_array($meta['stock_restored_qty'] ?? null) ? $meta['stock_restored_qty'] : [];
        foreach ($items as $row) {
            if (! is_array($row)) {
                continue;
            }
            $qty = max(0, (int) ($row['quantity'] ?? $row['qty'] ?? 0));
            if ($qty < 1) {
                continue;
            }
            $item = $this->matchItem($order, $row);
            if (! $item) {
                continue;
            }
            $key = (string) $item->id;
            $taken = (int) ($reduced[$key] ?? $item->quantity);
            $done = (int) ($restored[$key] ?? 0);
            $give = min($qty, max(0, $taken - $done));
            if ($give > 0 && $this->adjust($item, $give)) {
                $restored[$key] = $done + $give;
            }
        }
        $meta['stock_restored_qty'] = $restored;
        $fully = true;
        foreach ($order->items as $item) {
            $key = (string) $item->id;
            $taken = (int) ($reduced[$key] ?? 0);
            if ($taken > (int) ($restored[$key] ?? 0)) {
                $fully = false;
            }
        }
        if ($fully) {
            $meta['stock_reduced'] = false;
            $meta['marketplace_stock_reduced'] = false;
        }
        $order->meta = $meta;
        $order->saveQuietly();
    }

    /** @param  array<string, mixed>  $row */
    private function matchItem(Order $order, array $row): ?OrderItem
    {
        $itemId = (int) ($row['order_item_id'] ?? $row['item_id'] ?? 0);
        if ($itemId > 0) {
            return $order->items->firstWhere('id', $itemId);
        }
        $productId = (int) ($row['product_id'] ?? 0);
        if ($productId < 1) {
            return null;
        }

        return $order->items->firstWhere('product_id', $productId);
    }

    private function adjust(OrderItem $item, int $delta): bool
    {
        if ($item->product_variant_id) {
            $variant = ProductVariant::query()->whereKey($item->product_variant_id)->lockForUpdate()->first();
            if ($variant && $variant->manage_stock) {
                $this->applyDelta($variant, $delta);

                return true;
            }
        }
        $product = Product::query()->whereKey($item->product_id)->lockForUpdate()->first();
        if ($product && $product->manage_stock) {
            $this->applyDelta($product, $delta);

            return true;
        }

        return false;
    }

    private function applyDelta(Model $row, int $delta): void
    {
        if ($delta >= 0) {
            $row->update(['stock' => (int) $row->stock + $delta]);

            return;
        }
        $qty = -$delta;
        $updated = $row->newQuery()
            ->whereKey($row->getKey())
            ->where('stock', '>=', $qty)
            ->update(['stock' => DB::raw('stock - '.$qty)]);
        if ($updated !== 1) {
            throw ValidationException::withMessages(['stock' => 'Not enough stock.']);
        }
    }
}
