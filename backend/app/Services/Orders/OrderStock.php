<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;

/**
 * Decrements stock when an order becomes a confirmed sale and restores it when that sale is undone.
 * Cafe table orders count once they are created as processing (confirmed).
 */
final class OrderStock
{
    /** @var list<string> */
    private const RELEASE = ['cancelled', 'refunded', 'failed', 'payment_failed', 'webino-deleted'];

    public function sync(Order $order, ?string $from, string $to): void
    {
        $sales = \App\Services\Reports\OrderReports::salesStatuses();
        $was = $from !== null && in_array($from, $sales, true);
        $now = in_array($to, $sales, true);
        if (! $was && $now) {
            $this->reduce($order);

            return;
        }
        if ($was && ! $now && in_array($to, self::RELEASE, true)) {
            $this->restoreOutstanding($order);
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
            $variant = ProductVariant::query()->find($item->product_variant_id);
            if ($variant && $variant->manage_stock) {
                $variant->update(['stock' => max(0, (int) $variant->stock + $delta)]);

                return true;
            }
        }
        $product = Product::query()->find($item->product_id);
        if ($product && $product->manage_stock) {
            $product->update(['stock' => max(0, (int) $product->stock + $delta)]);

            return true;
        }

        return false;
    }
}
