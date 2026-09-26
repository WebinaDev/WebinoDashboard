<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceOrderMap;
use App\Models\MarketplaceProductMap;
use App\Models\Order;
use App\Models\OrderNote;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Orders\OrderWriter;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Imports normalized marketplace orders through OrderWriter, deduplicated by marketplace_order_maps,
 * and keeps the local status in sync on every later pull.
 */
class MarketplaceOrderImporter
{
    public const FINAL_STATUSES = ['completed', 'refunded', 'cancelled', 'failed'];

    /** True while an import writes orders, so status observers do not push the change back. */
    public static bool $importing = false;

    public function __construct(protected OrderWriter $writer) {}

    /**
     * @param  list<array<string, mixed>>  $list
     * @return array{created: int, updated: int, skipped: int, failed: int}
     */
    public function importMany(int $tenantId, MarketplaceAdapter $adapter, array $list): array
    {
        $stats = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'failed' => 0];
        foreach ($list as $item) {
            if (! is_array($item)) {
                continue;
            }
            $remoteId = (string) ($item['id'] ?? $item['order_id'] ?? '');
            if ($remoteId === '') {
                $stats['skipped']++;

                continue;
            }
            try {
                $existing = $this->findMap($tenantId, $adapter->platform(), $remoteId);
                $detail = $existing ? $item : ($adapter->getOrder($remoteId) ?? $item);
                $result = $this->importOne($tenantId, $adapter, array_merge($item, $detail));
                $stats[$result]++;
            } catch (Throwable $e) {
                $stats['failed']++;
                MarketplaceLogger::error($tenantId, $adapter->platform(), 'orders', 'Order import failed: '.$e->getMessage(), ['remote_id' => $remoteId]);
            }
        }
        MarketplaceLogger::info($tenantId, $adapter->platform(), 'orders', 'Orders pulled', $stats);

        return $stats;
    }

    public function findMap(int $tenantId, string $platform, string $remoteId): ?MarketplaceOrderMap
    {
        return MarketplaceOrderMap::query()
            ->where('tenant_id', $tenantId)
            ->where('platform', $platform)
            ->where('remote_order_id', $remoteId)
            ->first();
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return 'created'|'updated'|'skipped'
     */
    public function importOne(int $tenantId, MarketplaceAdapter $adapter, array $raw, array $extra = []): string
    {
        $platform = $adapter->platform();
        $normalized = $adapter->normalizeOrder($raw);
        $remoteId = (string) ($normalized['id'] ?: ($raw['id'] ?? ''));
        if ($remoteId === '') {
            return 'skipped';
        }

        $lock = Cache::lock("marketplace-order:{$tenantId}:{$platform}:{$remoteId}", 30);
        if (! $lock->get()) {
            return 'skipped';
        }

        if (method_exists($adapter, 'orderExtra')) {
            $extra = array_replace_recursive((array) $adapter->orderExtra($raw), $extra);
        }

        $wasImporting = self::$importing;
        self::$importing = true;
        try {
            $map = $this->findMap($tenantId, $platform, $remoteId);
            $localStatus = $adapter->mapOrderStatus((string) $normalized['status']);
            if ($map) {
                $metaChanged = $this->refreshExtra($map, $extra);
                $statusChanged = $this->updateStatus($map, (string) $normalized['status'], $localStatus, $raw);

                return $statusChanged || $metaChanged ? 'updated' : 'skipped';
            }

            $order = $this->createOrder($tenantId, $platform, $remoteId, $normalized, $localStatus, $extra);
            MarketplaceOrderMap::query()->create([
                'tenant_id' => $tenantId,
                'platform' => $platform,
                'remote_order_id' => $remoteId,
                'order_id' => $order->id,
                'status' => mb_substr((string) $normalized['status'], 0, 80),
                'fulfillment' => $extra['fulfillment'] ?? null,
                'raw' => $raw,
                'last_sync_at' => now(),
            ]);

            return 'created';
        } finally {
            self::$importing = $wasImporting;
            $lock->release();
        }
    }

    /**
     * Merge platform meta (e.g. Digikala fulfillment/shipment) into an already imported order.
     *
     * @param  array<string, mixed>  $extra
     */
    protected function refreshExtra(MarketplaceOrderMap $map, array $extra): bool
    {
        $changed = false;
        if (! empty($extra['fulfillment']) && $map->fulfillment !== $extra['fulfillment']) {
            $map->update(['fulfillment' => $extra['fulfillment']]);
            $changed = true;
        }
        $order = $map->order;
        if ($order && ! empty($extra['meta']) && is_array($extra['meta'])) {
            $next = array_replace($order->meta ?? [], $extra['meta']);
            if ($next != ($order->meta ?? [])) {
                $order->update(['meta' => $next]);
                $changed = true;
            }
        }

        return $changed;
    }

    /** @param  array<string, mixed>  $raw */
    public function updateStatus(MarketplaceOrderMap $map, string $remoteStatus, string $localStatus, array $raw = []): bool
    {
        $changed = $map->status !== mb_substr($remoteStatus, 0, 80);
        $map->update([
            'status' => mb_substr($remoteStatus, 0, 80),
            'raw' => $raw ?: $map->raw,
            'last_sync_at' => now(),
        ]);
        $order = $map->order;
        if (! $order || $remoteStatus === '' || $order->status === $localStatus) {
            return $changed;
        }
        if (in_array($order->status, self::FINAL_STATUSES, true) && ! in_array($localStatus, ['refunded', 'cancelled'], true)) {
            return $changed;
        }

        $previous = $order->status;
        $order->update(['status' => $localStatus]);
        if (in_array($localStatus, ['cancelled', 'refunded', 'failed'], true)) {
            $this->restoreStock($order);
        }
        OrderNote::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'body' => sprintf('وضعیت از %s به‌روزرسانی شد: %s ← %s (%s)', MarketplacePlatforms::label($map->platform), $previous, $localStatus, $remoteStatus),
            'is_customer' => false,
        ]);

        return true;
    }

    /**
     * @param  array<string, mixed>  $normalized
     * @param  array<string, mixed>  $extra
     */
    protected function createOrder(int $tenantId, string $platform, string $remoteId, array $normalized, string $status, array $extra): Order
    {
        $pricing = MarketplacePricing::forTenant($tenantId);
        $items = [];
        foreach ($normalized['items'] as $line) {
            $qty = max(1, (int) ($line['quantity'] ?? 1));
            $unit = $pricing->fromRemote((float) ($line['price'] ?? 0), $platform);
            $productMap = $this->findProductMap($tenantId, $platform, (string) ($line['product_id'] ?? ''), (string) ($line['variant_id'] ?? ''));
            $meta = [
                'marketplace' => $platform,
                'remote_product_id' => (string) ($line['product_id'] ?? ''),
                'remote_variant_id' => (string) ($line['variant_id'] ?? ''),
            ];
            if ($productMap && $productMap->product) {
                $items[] = [
                    'product_id' => $productMap->product_id,
                    'product_variant_id' => $productMap->product_variant_id,
                    'quantity' => $qty,
                    'unit_price_minor' => $unit,
                    'product_name' => (string) ($line['title'] ?? '') ?: null,
                    'meta' => $meta,
                ];
            } else {
                $items[] = [
                    'external' => true,
                    'product_name' => (string) ($line['title'] ?? '') ?: ('Remote #'.($line['variant_id'] ?? $line['product_id'] ?? '?')),
                    'quantity' => $qty,
                    'unit_price_minor' => $unit,
                    'meta' => $meta,
                ];
            }
        }
        if ($items === []) {
            $items[] = [
                'external' => true,
                'product_name' => MarketplacePlatforms::label($platform).' #'.$remoteId,
                'quantity' => 1,
                'unit_price_minor' => 0,
            ];
        }
        foreach ($items as &$item) {
            if (($item['product_name'] ?? null) === null) {
                unset($item['product_name']);
            }
        }
        unset($item);

        $customer = $normalized['customer'] ?? [];
        $address = array_filter([
            'first_name' => $customer['first_name'] ?? null,
            'last_name' => $customer['last_name'] ?? null,
            'phone' => $customer['phone'] ?? null,
            'address' => $customer['address'] ?? null,
            'city' => $customer['city'] ?? null,
            'state' => $customer['state'] ?? null,
            'postcode' => $customer['postcode'] ?? null,
            'country' => $customer['country'] ?? 'IR',
        ], fn ($v) => $v !== null && $v !== '');

        $paid = array_key_exists('paid', $extra) ? (bool) $extra['paid'] : in_array($status, ['processing', 'shipped', 'completed'], true);

        return DB::transaction(function () use ($tenantId, $platform, $remoteId, $items, $status, $customer, $address, $normalized, $extra, $pricing, $paid) {
            $order = $this->writer->create($tenantId, [
                'items' => $items,
                'status' => $status,
                'sales_channel' => $platform,
                'currency' => $pricing->storeCurrency(),
                'shipping_minor' => (int) ($extra['shipping_minor'] ?? 0),
                'customer_name' => ($customer['name'] ?? '') ?: null,
                'customer_phone' => ($customer['phone'] ?? '') ?: null,
                'customer_email' => ($customer['email'] ?? '') ?: null,
                'shipping_address' => $address ? json_encode($address, JSON_UNESCAPED_UNICODE) : null,
                'billing_address' => $address ?: null,
                'amount_paid_minor' => $paid ? null : 0,
                'payment_provider' => $platform,
                'payment_tender' => 'other',
                'meta' => array_merge([
                    'marketplace' => [
                        'platform' => $platform,
                        'remote_order_id' => $remoteId,
                        'remote_status' => (string) $normalized['status'],
                    ],
                ], $extra['meta'] ?? []),
            ]);
            $order->update(['amount_paid_minor' => $paid ? $order->total_minor : 0]);
            $this->reduceStock($order);
            OrderNote::query()->create([
                'tenant_id' => $tenantId,
                'order_id' => $order->id,
                'body' => sprintf('سفارش بازارچه از %s (شناسه ریموت #%s). ارسال از طریق همین پلتفرم.', MarketplacePlatforms::label($platform), $remoteId),
                'is_customer' => false,
            ]);

            return $order;
        });
    }

    public function findProductMap(int $tenantId, string $platform, string $remoteProduct, string $remoteVariant): ?MarketplaceProductMap
    {
        $base = MarketplaceProductMap::query()->with('product')->where('tenant_id', $tenantId)->where('platform', $platform);
        if ($remoteVariant !== '') {
            $hit = (clone $base)->where(function ($q) use ($remoteVariant) {
                $q->where('remote_variant_id', $remoteVariant)->orWhere(function ($q2) use ($remoteVariant) {
                    $q2->whereNull('remote_variant_id')->where('remote_product_id', $remoteVariant);
                });
            })->first();
            if ($hit) {
                return $hit;
            }
        }
        if ($remoteProduct !== '') {
            return (clone $base)->where('remote_product_id', $remoteProduct)->orderByRaw('product_variant_id is null desc')->first();
        }

        return null;
    }

    protected function reduceStock(Order $order): void
    {
        $this->adjustStock($order, -1);
        $order->update(['meta' => array_merge($order->meta ?? [], ['marketplace_stock_reduced' => true])]);
    }

    public function restoreStock(Order $order): void
    {
        if (empty(($order->meta ?? [])['marketplace_stock_reduced'])) {
            return;
        }
        $this->adjustStock($order, 1);
        $meta = $order->meta ?? [];
        $meta['marketplace_stock_reduced'] = false;
        $order->update(['meta' => $meta]);
    }

    protected function adjustStock(Order $order, int $sign): void
    {
        foreach ($order->items()->get() as $item) {
            if (! $item->product_id) {
                continue;
            }
            if ($item->product_variant_id) {
                $variant = ProductVariant::query()->find($item->product_variant_id);
                if ($variant && $variant->manage_stock) {
                    $variant->update(['stock' => max(0, (int) $variant->stock + $sign * (int) $item->quantity)]);

                    continue;
                }
            }
            $product = Product::query()->find($item->product_id);
            if ($product && $product->manage_stock) {
                $product->update(['stock' => max(0, (int) $product->stock + $sign * (int) $item->quantity)]);
            }
        }
    }
}
