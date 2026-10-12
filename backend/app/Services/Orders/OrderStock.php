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
 *
 * Orders waiting for payment hold (reserve) their stock: the rows are decremented under lock at
 * checkout and flagged stock_reserved with an expiry. Payment turns the hold into the sale without
 * a second decrement; failure, cancel or expiry gives it back.
 */
final class OrderStock
{
    public const RESERVE_STATUSES = ['pending_payment', 'awaiting_gateway'];

    public const RELEASE_STATUSES = ['payment_failed', 'cancelled', 'failed'];

    public static function reservationMinutes(): int
    {
        return max(1, (int) config('shop.stock_reservation_minutes', 15));
    }

    public function sync(Order $order, ?string $from, string $to): void
    {
        $sales = \App\Services\Reports\OrderReports::salesStatuses();
        $was = $from !== null && in_array($from, $sales, true);
        $now = in_array($to, $sales, true);
        if (! $was && $now) {
            // A gateway that already took the money must not be undone by a hold that expired meanwhile.
            $this->reduce($order, $to !== 'paid');
            $this->clearReservation($order);

            return;
        }
        if ($was && ! $now) {
            $this->restoreOutstanding($order);

            return;
        }
        if (! $was && in_array($to, self::RESERVE_STATUSES, true)) {
            $this->reserve($order);

            return;
        }
        if (! $was && in_array($to, self::RELEASE_STATUSES, true)) {
            $this->releaseReservation($order);
        }
    }

    /** Hold stock for an unpaid order. Idempotent; refreshes the expiry when already held. */
    public function reserve(Order $order): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        if (! empty($meta['stock_reduced']) && empty($meta['stock_reserved'])) {
            return;
        }
        if (empty($meta['stock_reduced'])) {
            $this->reduce($order);
            $order->refresh();
            $meta = is_array($order->meta) ? $order->meta : [];
            if (empty($meta['stock_reduced'])) {
                return;
            }
        }
        $meta['stock_reserved'] = true;
        $meta['stock_reserved_until'] = now()->addMinutes(self::reservationMinutes())->toIso8601String();
        $order->meta = $meta;
        $order->saveQuietly();
    }

    public function releaseReservation(Order $order): bool
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        if (empty($meta['stock_reserved'])) {
            return false;
        }
        $this->restoreOutstanding($order);
        $order->refresh();
        $this->clearReservation($order, true);

        return true;
    }

    /**
     * Give back holds whose time ran out. The order keeps its status so a late gateway
     * confirmation still verifies; it then takes stock again on paid.
     */
    public function releaseExpired(?\Carbon\CarbonInterface $now = null): int
    {
        $now ??= now();
        $released = 0;
        Order::query()
            ->whereIn('status', array_merge(self::RESERVE_STATUSES, ['payment_failed']))
            ->where('meta->stock_reserved', true)
            ->orderBy('id')
            ->chunkById(200, function ($orders) use ($now, &$released) {
                foreach ($orders as $candidate) {
                    DB::transaction(function () use ($candidate, $now, &$released) {
                        $order = Order::query()->whereKey($candidate->id)->lockForUpdate()->first();
                        if (! $order || ! in_array($order->status, array_merge(self::RESERVE_STATUSES, ['payment_failed']), true)) {
                            return;
                        }
                        $until = (string) (($order->meta ?? [])['stock_reserved_until'] ?? '');
                        if ($until !== '' && \Carbon\Carbon::parse($until)->greaterThan($now)) {
                            return;
                        }
                        if ($this->releaseReservation($order)) {
                            $released++;
                        }
                    });
                }
            });

        return $released;
    }

    private function clearReservation(Order $order, bool $expired = false): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        if (! array_key_exists('stock_reserved', $meta)) {
            return;
        }
        $meta['stock_reserved'] = false;
        unset($meta['stock_reserved_until']);
        if ($expired) {
            $meta['stock_reservation_released_at'] = now()->toIso8601String();
        }
        $order->meta = $meta;
        $order->saveQuietly();
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

    public function reduce(Order $order, bool $strict = true): void
    {
        $order->unsetRelation('items');
        $order->load('items');
        $meta = is_array($order->meta) ? $order->meta : [];
        if (! empty($meta['stock_reduced'])) {
            return;
        }
        $lines = [];
        $short = false;
        foreach ($order->items as $item) {
            $qty = max(0, (int) $item->quantity);
            if ($qty < 1 || ! $item->product_id) {
                continue;
            }
            $taken = $this->adjust($item, -$qty, $strict, $short);
            if ($taken !== null) {
                $lines[(string) $item->id] = $taken;
            }
        }
        $meta['stock_reduced'] = $lines !== [];
        $meta['stock_reduced_qty'] = $lines;
        // A fresh decrement starts a fresh restore ledger.
        $meta['stock_restored_qty'] = [];
        if ($short) {
            $meta['stock_shortfall'] = true;
        }
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
        $meta['stock_reserved'] = false;
        unset($meta['stock_reserved_until']);
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

    /** @return int|null quantity actually moved, null when the row does not track stock */
    private function adjust(OrderItem $item, int $delta, bool $strict = true, bool &$short = false): ?int
    {
        if ($item->product_variant_id) {
            $variant = ProductVariant::query()->whereKey($item->product_variant_id)->lockForUpdate()->first();
            if ($variant && $variant->manage_stock) {
                return $this->applyDelta($variant, $delta, $strict, $short);
            }
        }
        $product = Product::query()->whereKey($item->product_id)->lockForUpdate()->first();
        if ($product && $product->manage_stock) {
            return $this->applyDelta($product, $delta, $strict, $short);
        }

        return null;
    }

    private function applyDelta(Model $row, int $delta, bool $strict = true, bool &$short = false): int
    {
        if ($delta >= 0) {
            $row->newQuery()->whereKey($row->getKey())->update(['stock' => DB::raw('stock + '.$delta)]);

            return $delta;
        }
        $qty = -$delta;
        $updated = $row->newQuery()
            ->whereKey($row->getKey())
            ->where('stock', '>=', $qty)
            ->update(['stock' => DB::raw('stock - '.$qty)]);
        if ($updated === 1) {
            return $qty;
        }
        if ($strict) {
            throw ValidationException::withMessages(['stock' => 'Not enough stock.']);
        }
        // Paid after the hold lapsed: take what is left and flag the shortfall instead of failing a verified payment.
        $left = max(0, (int) $row->newQuery()->whereKey($row->getKey())->value('stock'));
        $row->newQuery()->whereKey($row->getKey())->update(['stock' => 0]);
        $short = true;

        return $left;
    }
}
