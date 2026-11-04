<?php

namespace App\Services\Marketplace\Basalam;

use App\Models\Order;
use App\Support\Currency;
use App\Services\Marketplace\MarketplacePricing;

/**
 * Normalize a Basalam vendor invoice for the order screen (WP Webino_Basalam_Order_View parity).
 */
class BasalamOrderView
{
    /**
     * @return array<string, mixed>
     */
    public static function forOrder(Order $order, BasalamOrders $orders): array
    {
        $invoiceId = $orders->invoiceOf($order);
        $cached = self::readCache($order);
        if (is_array($cached)) {
            $cached['woo_status'] = $order->status;
            $cached['local_status'] = $order->status;

            return $cached;
        }

        try {
            $data = $orders->detail($invoiceId);
        } catch (\Throwable) {
            return self::fromOrder($order, (string) $invoiceId);
        }

        $orders->rememberSnapshot($order, $data);
        $order->refresh();
        $fresh = self::readCache($order);
        if (is_array($fresh)) {
            return $fresh;
        }

        return self::present($order, $data, (string) $invoiceId);
    }

    /**
     * Persist the normalized view. Skips thin status-only payloads so a full snapshot is kept.
     *
     * @param  array<string, mixed>  $data
     */
    public static function remember(Order $order, array $data): void
    {
        if (empty($data['items']) && empty($data['financial_report']) && empty($data['customer_data'])) {
            return;
        }
        $invoice = (string) ($data['id'] ?? data_get($order->meta, 'basalam.invoice_id') ?? '');
        $view = self::present($order, $data, $invoice);
        $meta = $order->meta ?? [];
        $meta['basalam']['order_snapshot'] = $view;
        $order->update(['meta' => $meta]);
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function readCache(Order $order): ?array
    {
        $snap = data_get($order->meta, 'basalam.order_snapshot');

        return is_array($snap) ? $snap : null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function present(Order $order, array $data, string $invoice): array
    {
        $status = isset($data['status']) && is_array($data['status']) ? $data['status'] : [];
        $customer = isset($data['customer_data']) && is_array($data['customer_data']) ? $data['customer_data'] : [];
        $recipient = isset($customer['recipient']) && is_array($customer['recipient']) ? $customer['recipient'] : [];
        $city = isset($customer['city']) && is_array($customer['city']) ? $customer['city'] : [];
        $province = isset($city['parent']) && is_array($city['parent']) ? (string) ($city['parent']['title'] ?? '') : '';
        $currency = (string) ($order->currency ?: MarketplacePricing::forTenant((int) $order->tenant_id)->storeCurrency());

        $items = [];
        foreach ((array) ($data['items'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $qty = max(1, (int) ($item['quantity'] ?? 1));
            $product = isset($item['product']) && is_array($item['product']) ? $item['product'] : [];
            $items[] = [
                'title' => (string) ($product['title'] ?? $item['title'] ?? ''),
                'quantity' => $qty,
                'id' => (string) ($product['id'] ?? $item['id'] ?? ''),
                'amount' => self::money(BasalamOrders::lineTotalRial($item, $qty), $currency),
            ];
        }

        $tracking = self::pickString($data, [
            'parcel_detail.tracking_code',
            'parcel_detail.post_tracking_code',
            'shipping.tracking_code',
            'tracking_code',
        ]);
        if ($tracking === '') {
            $tracking = (string) (data_get($order->meta, 'basalam.tracking_code') ?? $order->tracking_code ?? '');
        }

        $coupon = '';
        if (isset($data['coupon']) && is_array($data['coupon'])) {
            $coupon = (string) ($data['coupon']['code'] ?? $data['coupon']['title'] ?? '');
        } elseif (isset($data['coupon']) && is_scalar($data['coupon'])) {
            $coupon = (string) $data['coupon'];
        } elseif (isset($data['coupons'][0])) {
            $first = $data['coupons'][0];
            $coupon = is_array($first) ? (string) ($first['code'] ?? $first['title'] ?? '') : (string) $first;
        }

        $statusId = (int) ($status['id'] ?? 0);
        $statusKey = BasalamOrders::statusKey($statusId);

        return [
            'order_id' => $order->id,
            'woo_status' => $order->status,
            'local_status' => $order->status,
            'invoice_id' => (string) $invoice,
            'code' => (string) ($data['id'] ?? $invoice),
            'hash_id' => (string) ($data['hash_id'] ?? data_get($order->meta, 'basalam.hash_id') ?? ''),
            'status_id' => $statusId,
            'status_key' => $statusKey !== '' ? 'bslm-'.$statusKey : null,
            'status_title' => (string) ($status['title'] ?? $status['name'] ?? ''),
            'notice' => self::notice($data, $status),
            'created_at' => self::iso($data['created_at'] ?? $data['paid_at'] ?? null),
            'confirmed_at' => self::iso(self::deep($data, ['parcel_detail.confirmed_at', 'confirmed_at', 'preparation_at'])),
            'shipped_at' => self::iso(self::deep($data, ['parcel_detail.posted_at', 'parcel_detail.shipped_at', 'posted_at'])),
            'delivery_estimate' => self::estimate($data),
            'shipping_method' => self::pickString($data, [
                'parcel_detail.shipping_method.title',
                'shipping_method.title',
                'shipping_method',
            ]) ?: (string) data_get($order->meta, 'basalam.shipping_method', ''),
            'tracking_code' => $tracking,
            'coupon' => $coupon,
            'purchase_count' => (int) ($customer['purchase_count'] ?? $customer['orders_count'] ?? 0),
            'recipient' => [
                'name' => (string) ($recipient['name'] ?? ''),
                'phone' => (string) ($recipient['mobile'] ?? $recipient['phone'] ?? ''),
                'province' => $province,
                'city' => (string) ($city['title'] ?? ''),
                'address' => (string) ($recipient['postal_address'] ?? $recipient['address'] ?? ''),
                'postcode' => (string) ($recipient['postal_code'] ?? ''),
            ],
            'items' => $items,
            'finance' => self::finance(
                isset($data['financial_report']) && is_array($data['financial_report']) ? $data['financial_report'] : [],
                $currency,
            ),
            'sale_total' => BasalamOrders::saleTotalFromInvoice($data, $currency),
            'currency' => $currency,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function fromOrder(Order $order, string $invoice): array
    {
        $items = [];
        foreach ($order->items ?? [] as $item) {
            $items[] = [
                'title' => (string) ($item->product_name ?? ''),
                'quantity' => (int) $item->quantity,
                'id' => '',
                'amount' => (float) $item->unit_price_minor * (int) $item->quantity,
            ];
        }

        return [
            'order_id' => $order->id,
            'woo_status' => $order->status,
            'local_status' => $order->status,
            'invoice_id' => $invoice,
            'code' => $invoice,
            'hash_id' => (string) data_get($order->meta, 'basalam.hash_id', ''),
            'status_title' => (string) data_get($order->meta, 'basalam.status_key', ''),
            'status_key' => data_get($order->meta, 'basalam.status_key'),
            'tracking_code' => (string) (data_get($order->meta, 'basalam.tracking_code') ?? $order->tracking_code ?? ''),
            'shipping_method' => (string) data_get($order->meta, 'basalam.shipping_method', ''),
            'recipient' => [
                'name' => (string) ($order->customer_name ?? ''),
                'phone' => (string) ($order->customer_phone ?? ''),
                'address' => '',
                'postcode' => '',
            ],
            'items' => $items,
            'finance' => [],
            'currency' => (string) ($order->currency ?: 'IRT'),
            'cached' => false,
        ];
    }

    /**
     * @param  array<string, mixed>  $report
     * @return list<array<string, mixed>>
     */
    private static function finance(array $report, string $currency): array
    {
        $groups = [
            ['key' => 'products', 'title' => 'هزینه محصولات', 'keys' => ['product_cost', 'product_submit']],
            ['key' => 'shipping', 'title' => 'هزینه ارسال', 'keys' => ['shipping_cost', 'shipping_submit']],
            ['key' => 'balance', 'title' => 'مبالغ اضافه‌شده به تراز', 'keys' => ['product_balance', 'shipping_balance'], 'pending' => true],
        ];
        $out = [];
        foreach ($groups as $group) {
            $rows = [];
            $total = null;
            foreach ($group['keys'] as $key) {
                $block = isset($report[$key]) && is_array($report[$key]) ? $report[$key] : null;
                if (! $block) {
                    continue;
                }
                $blockRows = self::financeRows($block, ! empty($group['pending']));
                if ($blockRows && ! $rows) {
                    $rows = $blockRows;
                } elseif (! empty($group['pending'])) {
                    $rows = array_merge($rows, $blockRows);
                }
                if ($total === null) {
                    $total = self::blockTotal($block);
                }
            }
            if (! $rows && $total === null) {
                continue;
            }
            $out[] = [
                'key' => $group['key'],
                'title' => $group['title'],
                'total' => ! empty($group['pending']) ? null : self::money($total, $currency),
                'rows' => array_map(function (array $row) use ($currency) {
                    $row['amount'] = self::money($row['amount_rial'] ?? $row['amount'] ?? null, $currency);

                    return $row;
                }, $rows),
            ];
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $block
     * @return list<array<string, mixed>>
     */
    private static function financeRows(array $block, bool $pending): array
    {
        $rows = [];
        foreach ((array) ($block['report_items'] ?? []) as $row) {
            if (! is_array($row)) {
                continue;
            }
            $state = '';
            if (isset($row['status']) && is_array($row['status'])) {
                $state = (string) ($row['status']['title'] ?? $row['status']['description'] ?? '');
            } elseif (isset($row['status']) && is_scalar($row['status'])) {
                $state = (string) $row['status'];
            }
            if ($state === '' && $pending) {
                $state = 'در انتظار تعیین وضعیت';
            }
            $rows[] = [
                'title' => (string) ($row['title'] ?? ''),
                'amount_rial' => $row['amount'] ?? null,
                'state' => $state,
            ];
        }
        if (! $rows && $pending) {
            $title = (string) ($block['title'] ?? '');
            if ($title !== '') {
                $rows[] = [
                    'title' => $title,
                    'amount_rial' => self::blockTotal($block),
                    'state' => 'در انتظار تعیین وضعیت',
                ];
            }
        }

        return $rows;
    }

    /** @param  array<string, mixed>  $block */
    private static function blockTotal(array $block): mixed
    {
        if (isset($block['total']) && is_array($block['total'])) {
            return $block['total']['amount'] ?? null;
        }
        if (isset($block['total']) && is_numeric($block['total'])) {
            return $block['total'];
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $status
     */
    private static function notice(array $data, array $status): string
    {
        $title = (string) ($status['title'] ?? $status['name'] ?? '');
        $text = self::pickString($data, [
            'status.description',
            'status.message',
            'status.hint',
            'parcel_detail.status_description',
            'parcel_detail.description',
            'parcel_detail.message',
            'notice',
            'description',
        ]);
        if ($text === $title) {
            return '';
        }

        return $text;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{from: ?string, to: ?string, text: string}
     */
    private static function estimate(array $data): array
    {
        return [
            'from' => self::iso(self::deep($data, ['parcel_detail.estimated_delivery_from', 'estimated_delivery_from', 'delivery_from'])),
            'to' => self::iso(self::deep($data, ['parcel_detail.estimated_delivery_to', 'estimated_delivery_to', 'delivery_to'])),
            'text' => self::pickString($data, ['parcel_detail.estimated_delivery', 'estimated_delivery', 'delivery_estimate']),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  list<string>  $paths
     */
    public static function pickString(array $data, array $paths): string
    {
        $v = self::deep($data, $paths);

        return is_scalar($v) ? trim((string) $v) : '';
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  list<string>  $paths
     */
    private static function deep(array $data, array $paths): mixed
    {
        foreach ($paths as $path) {
            $cur = $data;
            foreach (explode('.', $path) as $key) {
                if (! is_array($cur) || ! array_key_exists($key, $cur)) {
                    $cur = null;
                    break;
                }
                $cur = $cur[$key];
            }
            if ($cur !== null && $cur !== '') {
                return $cur;
            }
        }

        return null;
    }

    private static function iso(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            $ts = (int) $value;
            if ($ts > 1_000_000_000_000) {
                $ts = (int) floor($ts / 1000);
            }

            return gmdate('c', $ts);
        }
        $ts = strtotime((string) $value);

        return $ts ? gmdate('c', $ts) : null;
    }

    private static function money(mixed $rial, string $currency): ?float
    {
        if (! is_numeric($rial)) {
            return null;
        }

        return (float) Currency::fromRial((float) $rial, $currency);
    }
}
