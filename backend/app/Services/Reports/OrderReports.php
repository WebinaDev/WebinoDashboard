<?php

namespace App\Services\Reports;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Shop order / inventory reports (port of Webino_Dashboard_Order_Reports).
 */
final class OrderReports
{
    public const SALES_EXCLUDE = [
        'pending_payment', 'awaiting_gateway', 'on_hold', 'payment_failed',
        'cancelled', 'refunded', 'failed',
    ];

    public const SALES_STATUSES = ['paid', 'processing', 'shipped', 'completed'];

    /** @return array{from_ts: int, to_ts: int, from: string, to: string, interval: string, statuses: list<string>, compare: bool} */
    public function parseRequest(\Illuminate\Http\Request $request): array
    {
        $toTs = $request->filled('to') ? (int) $request->query('to') : time();
        $fromTs = $request->filled('from') ? (int) $request->query('from') : ($toTs - 30 * 86400);
        $interval = in_array($request->query('interval'), ['day', 'week', 'month'], true)
            ? (string) $request->query('interval') : 'day';
        $statuses = $this->parseStatuses($request->query('status'));
        $compare = filter_var($request->query('compare', false), FILTER_VALIDATE_BOOLEAN);

        return [
            'from_ts' => $fromTs,
            'to_ts' => $toTs,
            'from' => date('c', $fromTs),
            'to' => date('c', $toTs),
            'from_date' => date('Y-m-d', $fromTs),
            'to_date' => date('Y-m-d', $toTs),
            'interval' => $interval,
            'statuses' => $statuses,
            'compare' => $compare,
        ];
    }

    /** @return list<string> */
    public function parseStatuses(mixed $raw): array
    {
        if (is_string($raw) && $raw !== '') {
            $parts = array_filter(array_map('trim', explode(',', $raw)));
        } elseif (is_array($raw)) {
            $parts = array_filter(array_map(fn ($v) => is_scalar($v) ? trim((string) $v) : '', $raw));
        } else {
            $parts = [];
        }
        $parts = array_values(array_intersect($parts, Order::STATUSES));

        return $parts !== [] ? $parts : self::SALES_STATUSES;
    }

    /** @return array{from_ts: int, to_ts: int, from_date: string, to_date: string} */
    public function compareRange(int $fromTs, int $toTs): array
    {
        $len = max(1, $toTs - $fromTs);
        $prevTo = $fromTs - 1;
        $prevFrom = $prevTo - $len;

        return [
            'from_ts' => $prevFrom,
            'to_ts' => $prevTo,
            'from_date' => date('Y-m-d', $prevFrom),
            'to_date' => date('Y-m-d', $prevTo),
            'from' => date('c', $prevFrom),
            'to' => date('c', $prevTo),
        ];
    }

    /**
     * @param  list<string>  $statuses
     * @return array<string, mixed>
     */
    public function buildReport(int $tenantId, int $fromTs, int $toTs, string $interval, array $statuses): array
    {
        $orders = $this->loadOrders($tenantId, $fromTs, $toTs, $statuses);
        $currency = (string) ($orders->first()?->currency ?: 'IRR');
        $agg = $this->aggregate($orders, $interval);

        return array_merge([
            'currency' => $currency,
            'from' => date('c', $fromTs),
            'to' => date('c', $toTs),
            'from_date' => date('Y-m-d', $fromTs),
            'to_date' => date('Y-m-d', $toTs),
            'interval' => $interval,
            'statuses' => $statuses,
            'truncated' => $orders->count() >= 10000,
        ], $agg);
    }

    /**
     * @param  list<string>  $statuses
     * @return Collection<int, Order>
     */
    private function loadOrders(int $tenantId, int $fromTs, int $toTs, array $statuses): Collection
    {
        return Order::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', $statuses)
            ->whereBetween('created_at', [
                Carbon::createFromTimestamp($fromTs)->utc(),
                Carbon::createFromTimestamp($toTs)->utc(),
            ])
            ->with(['items.product.category', 'items.variant', 'user:id,name,email'])
            ->orderBy('created_at')
            ->limit(10000)
            ->get();
    }

    /**
     * @param  Collection<int, Order>  $orders
     * @return array<string, mixed>
     */
    private function aggregate(Collection $orders, string $interval): array
    {
        $summary = [
            'revenue' => 0, 'net_revenue' => 0, 'refunds' => 0, 'refund_count' => 0,
            'order_count' => 0, 'avg_order_value' => 0, 'items_sold' => 0,
            'discount_total' => 0, 'shipping_total' => 0, 'tax_total' => 0,
            'cogs' => 0, 'gross_profit' => 0, 'gross_margin_pct' => 0,
            'items_missing_cost' => 0, 'wfcp_enabled' => true, 'new_customers' => 0,
            'returning_customers' => 0, 'items_per_order' => 0, 'target_margin_pct' => 30,
        ];
        $seriesMap = [];
        $byStatus = [];
        $byPayment = [];
        $bySource = [];
        $byHour = array_fill(0, 24, ['hour' => 0, 'orders' => 0, 'revenue' => 0]);
        for ($h = 0; $h < 24; $h++) {
            $byHour[$h]['hour'] = $h;
        }
        $products = [];
        $variations = [];
        $categories = [];
        $customers = [];
        $coupons = [];
        $seenUsers = [];

        foreach ($orders as $order) {
            $rev = (int) $order->total_minor;
            $discount = (int) $order->discount_minor;
            $shipping = (int) $order->shipping_minor;
            $summary['order_count']++;
            $summary['revenue'] += $rev;
            $summary['discount_total'] += $discount;
            $summary['shipping_total'] += $shipping;
            $summary['net_revenue'] += max(0, $rev - $shipping);

            $status = (string) $order->status;
            $byStatus[$status] = ($byStatus[$status] ?? ['status' => $status, 'orders' => 0, 'revenue' => 0]);
            $byStatus[$status]['orders']++;
            $byStatus[$status]['revenue'] += $rev;

            $pay = (string) ($order->payment_provider ?: $order->payment_tender ?: 'other');
            $byPayment[$pay] = ($byPayment[$pay] ?? ['method' => $pay, 'orders' => 0, 'revenue' => 0]);
            $byPayment[$pay]['orders']++;
            $byPayment[$pay]['revenue'] += $rev;

            $src = (string) ($order->sales_channel ?: 'site');
            $bySource[$src] = ($bySource[$src] ?? ['source' => $src, 'orders' => 0, 'revenue' => 0]);
            $bySource[$src]['orders']++;
            $bySource[$src]['revenue'] += $rev;

            $hour = (int) Carbon::parse($order->created_at)->timezone(config('app.timezone') === 'UTC' ? 'Asia/Tehran' : config('app.timezone'))->format('G');
            $byHour[$hour]['orders']++;
            $byHour[$hour]['revenue'] += $rev;

            $key = $this->bucketKey($order->created_at, $interval);
            if (! isset($seriesMap[$key])) {
                $seriesMap[$key] = [
                    'key' => $key, 'label' => $key, 'revenue' => 0, 'orders' => 0, 'items' => 0,
                    'cogs' => 0, 'profit' => 0, 'refunds' => 0, 'coupons' => 0, 'net' => 0, 'tax' => 0, 'shipping' => 0,
                ];
            }
            $seriesMap[$key]['orders']++;
            $seriesMap[$key]['revenue'] += $rev;
            $seriesMap[$key]['shipping'] += $shipping;
            $seriesMap[$key]['coupons'] += $discount;
            $seriesMap[$key]['net'] += max(0, $rev - $shipping);

            if ($order->coupon_code) {
                $code = (string) $order->coupon_code;
                $coupons[$code] = ($coupons[$code] ?? ['code' => $code, 'count' => 0, 'revenue' => 0, 'discount' => 0]);
                $coupons[$code]['count']++;
                $coupons[$code]['revenue'] += $rev;
                $coupons[$code]['discount'] += $discount;
            }

            $cid = $order->user_id ?: ('guest-'.$order->customer_email.$order->customer_phone);
            $isNew = ! isset($seenUsers[$cid]);
            $seenUsers[$cid] = true;
            if ($isNew) {
                $summary['new_customers']++;
            } else {
                $summary['returning_customers']++;
            }
            $customers[$cid] = ($customers[$cid] ?? [
                'customer_id' => $order->user_id, 'name' => $order->customer_name ?: ($order->user?->name ?? '—'),
                'email' => $order->customer_email ?: ($order->user?->email ?? ''), 'orders' => 0, 'revenue' => 0,
                'aov' => 0, 'is_new' => $isNew, 'last_order' => null,
            ]);
            $customers[$cid]['orders']++;
            $customers[$cid]['revenue'] += $rev;
            $customers[$cid]['last_order'] = (string) $order->created_at;
            $customers[$cid]['is_new'] = $customers[$cid]['is_new'] && $isNew;

            foreach ($order->items as $item) {
                $qty = (int) $item->quantity;
                $lineRev = (int) $item->unit_price_minor * $qty;
                $unitCost = $this->unitCost($item);
                $missing = $unitCost === null;
                $cogs = $missing ? 0 : $unitCost * $qty;
                $profit = $lineRev - $cogs;
                $summary['items_sold'] += $qty;
                $summary['cogs'] += $cogs;
                if ($missing) {
                    $summary['items_missing_cost'] += $qty;
                }
                $seriesMap[$key]['items'] += $qty;
                $seriesMap[$key]['cogs'] += $cogs;
                $seriesMap[$key]['profit'] += $profit;

                $pid = (int) ($item->product_id ?: 0);
                $pkey = $pid ?: ('name:'.$item->product_name);
                $products[$pkey] = ($products[$pkey] ?? [
                    'product_id' => $pid ?: null, 'name' => (string) ($item->product_name ?: $item->product?->name ?: '—'),
                    'quantity' => 0, 'revenue' => 0, 'cogs' => 0, 'profit' => 0, 'margin_pct' => 0,
                    'missing_cost' => 0, 'avg_sell_price' => 0, 'avg_cost' => 0,
                ]);
                $products[$pkey]['quantity'] += $qty;
                $products[$pkey]['revenue'] += $lineRev;
                $products[$pkey]['cogs'] += $cogs;
                $products[$pkey]['profit'] += $profit;
                $products[$pkey]['missing_cost'] += $missing ? $qty : 0;

                if ($item->product_variant_id) {
                    $vid = (int) $item->product_variant_id;
                    $variations[$vid] = ($variations[$vid] ?? [
                        'variation_id' => $vid, 'product_id' => $pid, 'name' => (string) ($item->product_name ?: '—'),
                        'quantity' => 0, 'revenue' => 0, 'cogs' => 0, 'profit' => 0, 'margin_pct' => 0,
                        'missing_cost' => 0, 'avg_sell_price' => 0, 'avg_cost' => 0,
                    ]);
                    $variations[$vid]['quantity'] += $qty;
                    $variations[$vid]['revenue'] += $lineRev;
                    $variations[$vid]['cogs'] += $cogs;
                    $variations[$vid]['profit'] += $profit;
                    $variations[$vid]['missing_cost'] += $missing ? $qty : 0;
                }

                $catId = (int) ($item->product?->category_id ?? 0);
                $catName = (string) ($item->product?->category?->name ?? '—');
                $ck = $catId ?: ('n:'.$catName);
                $categories[$ck] = ($categories[$ck] ?? [
                    'term_id' => $catId ?: null, 'name' => $catName,
                    'quantity' => 0, 'revenue' => 0, 'cogs' => 0, 'profit' => 0, 'margin_pct' => 0,
                    'missing_cost' => 0, 'avg_sell_price' => 0, 'avg_cost' => 0,
                ]);
                $categories[$ck]['quantity'] += $qty;
                $categories[$ck]['revenue'] += $lineRev;
                $categories[$ck]['cogs'] += $cogs;
                $categories[$ck]['profit'] += $profit;
                $categories[$ck]['missing_cost'] += $missing ? $qty : 0;
            }
        }

        $summary['gross_profit'] = $summary['revenue'] - $summary['cogs'];
        $summary['gross_margin_pct'] = $summary['revenue'] > 0
            ? round($summary['gross_profit'] / $summary['revenue'] * 100, 2) : 0;
        $summary['avg_order_value'] = $summary['order_count'] > 0
            ? (int) round($summary['revenue'] / $summary['order_count']) : 0;
        $summary['items_per_order'] = $summary['order_count'] > 0
            ? round($summary['items_sold'] / $summary['order_count'], 2) : 0;

        $finish = function (array $rows) {
            foreach ($rows as &$r) {
                $r['margin_pct'] = ($r['revenue'] ?? 0) > 0 ? round(($r['profit'] ?? 0) / $r['revenue'] * 100, 2) : 0;
                $r['avg_sell_price'] = ($r['quantity'] ?? 0) > 0 ? (int) round($r['revenue'] / $r['quantity']) : 0;
                $r['avg_cost'] = ($r['quantity'] ?? 0) > 0 ? (int) round(($r['cogs'] ?? 0) / $r['quantity']) : 0;
            }

            return array_values($rows);
        };

        foreach ($customers as &$c) {
            $c['aov'] = $c['orders'] > 0 ? (int) round($c['revenue'] / $c['orders']) : 0;
        }
        unset($c);

        $productsList = $finish($products);
        usort($productsList, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);
        $profitList = $productsList;
        usort($profitList, fn ($a, $b) => $b['profit'] <=> $a['profit']);
        $catsList = $finish($categories);
        usort($catsList, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);
        $varsList = $finish($variations);
        usort($varsList, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);
        $custList = array_values($customers);
        usort($custList, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);
        $coupList = array_values($coupons);
        usort($coupList, fn ($a, $b) => $b['discount'] <=> $a['discount']);

        ksort($seriesMap);

        return [
            'summary' => $summary,
            'series' => array_values($seriesMap),
            'by_status' => array_values($byStatus),
            'by_payment' => array_values($byPayment),
            'by_source' => array_values($bySource),
            'by_hour' => array_values($byHour),
            'by_price_tier' => [],
            'heatmap' => [],
            'top_products' => array_slice($productsList, 0, 10),
            'top_categories' => array_slice($catsList, 0, 10),
            'top_customers' => array_slice($custList, 0, 10),
            'top_coupons' => array_slice($coupList, 0, 10),
            'top_products_profit' => array_slice($profitList, 0, 10),
            'products' => array_slice($productsList, 0, 50),
            'variations' => array_slice($varsList, 0, 50),
            'categories_full' => array_slice($catsList, 0, 50),
            'brands' => [],
            'customers_full' => array_slice($custList, 0, 50),
            'coupons_full' => array_slice($coupList, 0, 50),
            'taxes' => [],
            'downloads' => [],
        ];
    }

    private function unitCost(OrderItem $item): ?int
    {
        $meta = is_array($item->meta) ? $item->meta : [];
        if (isset($meta['cogs_unit_minor'])) {
            return max(0, (int) $meta['cogs_unit_minor']);
        }
        if (isset($meta['_wfcp_cogs'])) {
            $raw = (int) $meta['_wfcp_cogs'];
            $qty = max(1, (int) $item->quantity);

            return $raw > $item->unit_price_minor * 2 ? (int) round($raw / $qty) : $raw;
        }
        $variant = $item->variant;
        if ($variant && $variant->purchase_price_minor !== null) {
            return max(0, (int) $variant->purchase_price_minor);
        }
        $product = $item->product;
        if ($product && $product->purchase_price_minor !== null) {
            return max(0, (int) $product->purchase_price_minor);
        }

        return null;
    }

    private function bucketKey($createdAt, string $interval): string
    {
        $dt = Carbon::parse($createdAt)->timezone(config('app.timezone') === 'UTC' ? 'Asia/Tehran' : config('app.timezone'));

        return match ($interval) {
            'week' => $dt->format('o-\WW'),
            'month' => $dt->format('Y-m'),
            default => $dt->format('Y-m-d'),
        };
    }

    /**
     * @param  array<string, mixed>  $report
     * @return array<string, mixed>
     */
    public function listSection(array $report, string $section, int $page = 1, int $perPage = 20, string $search = ''): array
    {
        $map = [
            'products' => 'products',
            'variations' => 'variations',
            'categories' => 'categories_full',
            'brands' => 'brands',
            'coupons' => 'coupons_full',
            'taxes' => 'taxes',
            'customers' => 'customers_full',
            'downloads' => 'downloads',
        ];
        $key = $map[$section] ?? null;
        $rows = $key ? ($report[$key] ?? []) : [];
        if ($search !== '') {
            $needle = mb_strtolower($search);
            $rows = array_values(array_filter($rows, function ($r) use ($needle) {
                foreach (['name', 'code', 'email', 'label'] as $f) {
                    if (isset($r[$f]) && str_contains(mb_strtolower((string) $r[$f]), $needle)) {
                        return true;
                    }
                }

                return false;
            }));
        }
        $total = count($rows);
        $slice = array_slice($rows, ($page - 1) * $perPage, $perPage);

        return [
            'currency' => $report['currency'],
            'from' => $report['from'],
            'to' => $report['to'],
            'from_date' => $report['from_date'],
            'to_date' => $report['to_date'],
            'interval' => $report['interval'],
            'statuses' => $report['statuses'],
            'summary' => $report['summary'],
            'series' => $report['series'],
            'section' => $section,
            'items' => $slice,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'truncated' => $report['truncated'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function stock(int $tenantId, string $filter = 'all', int $page = 1, int $perPage = 50, ?int $categoryId = null): array
    {
        $threshold = 10;
        $q = Product::query()->where('tenant_id', $tenantId)->with(['variants', 'category']);
        if ($categoryId) {
            $q->where('category_id', $categoryId);
        }
        $products = $q->orderBy('name')->get();
        $items = [];
        $summary = [
            'sku_count' => 0, 'units_in_stock' => 0, 'outofstock_count' => 0, 'low_stock_count' => 0,
            'missing_cost_count' => 0, 'value_purchase' => 0, 'value_retail' => 0, 'value_current' => 0,
            'value_wholesale' => 0, 'value_credit' => 0, 'potential_profit' => 0,
            'wfcp_enabled' => true, 'target_margin_pct' => 30,
        ];

        $push = function (array $row) use (&$items, &$summary, $filter, $threshold) {
            $qty = (int) $row['stock_qty'];
            $status = (string) $row['stock_status'];
            $isLow = $qty > 0 && $qty < $threshold;
            $row['is_low_stock'] = $isLow;
            $row['low_stock_amount'] = $threshold;
            if ($filter === 'outofstock' && $status !== 'outofstock' && $qty !== 0) {
                return;
            }
            if ($filter === 'low' && ! $isLow) {
                return;
            }
            if ($filter === 'instock' && ($status === 'outofstock' || $qty === 0)) {
                return;
            }
            $items[] = $row;
            $summary['sku_count']++;
            $summary['units_in_stock'] += max(0, $qty);
            if ($status === 'outofstock' || $qty === 0) {
                $summary['outofstock_count']++;
            }
            if ($isLow) {
                $summary['low_stock_count']++;
            }
            if ($row['missing_cost']) {
                $summary['missing_cost_count']++;
            }
            $summary['value_purchase'] += $row['values']['purchase'];
            $summary['value_retail'] += $row['values']['retail'];
            $summary['value_current'] += $row['values']['current'];
            $summary['potential_profit'] += $row['potential_profit'];
        };

        foreach ($products as $p) {
            if ($p->variants->isNotEmpty()) {
                foreach ($p->variants as $v) {
                    $purchase = $v->purchase_price_minor ?? $p->purchase_price_minor;
                    $retail = (int) ($v->price_minor ?: $p->price_minor);
                    $current = (int) ($v->sale_price_minor ?: $v->price_minor ?: $p->sale_price_minor ?: $p->price_minor);
                    $qty = (int) ($v->stock ?? 0);
                    $push([
                        'id' => $v->id, 'parent_id' => $p->id, 'name' => trim($p->name.' - '.($v->name ?: '')),
                        'sku' => (string) ($v->sku ?: ''), 'type' => 'variation',
                        'manage_stock' => (bool) $v->manage_stock, 'stock_qty' => $qty,
                        'stock_status' => (string) ($v->stock_status ?: ($qty > 0 ? 'instock' : 'outofstock')),
                        'missing_cost' => $purchase === null,
                        'prices' => [
                            'purchase' => (int) ($purchase ?? 0), 'regular' => $retail, 'sale' => (int) ($v->sale_price_minor ?? 0),
                            'current' => $current, 'retail' => $retail, 'credit' => 0, 'wholesale' => 0, 'installment' => 0,
                        ],
                        'values' => [
                            'purchase' => (int) ($purchase ?? 0) * $qty, 'retail' => $retail * $qty, 'current' => $current * $qty,
                        ],
                        'potential_profit' => ($current - (int) ($purchase ?? 0)) * $qty,
                        'potential_margin' => $current > 0 ? round(($current - (int) ($purchase ?? 0)) / $current * 100, 2) : 0,
                    ]);
                }
            } else {
                $purchase = $p->purchase_price_minor;
                $retail = (int) $p->price_minor;
                $current = (int) ($p->sale_price_minor ?: $p->price_minor);
                $qty = (int) ($p->stock ?? 0);
                $push([
                    'id' => $p->id, 'parent_id' => null, 'name' => (string) $p->name,
                    'sku' => (string) ($p->sku ?: ''), 'type' => 'simple',
                    'manage_stock' => (bool) $p->manage_stock, 'stock_qty' => $qty,
                    'stock_status' => (string) ($p->stock_status ?: ($qty > 0 ? 'instock' : 'outofstock')),
                    'missing_cost' => $purchase === null,
                    'prices' => [
                        'purchase' => (int) ($purchase ?? 0), 'regular' => $retail, 'sale' => (int) ($p->sale_price_minor ?? 0),
                        'current' => $current, 'retail' => $retail, 'credit' => 0, 'wholesale' => 0, 'installment' => 0,
                    ],
                    'values' => [
                        'purchase' => (int) ($purchase ?? 0) * $qty, 'retail' => $retail * $qty, 'current' => $current * $qty,
                    ],
                    'potential_profit' => ($current - (int) ($purchase ?? 0)) * $qty,
                    'potential_margin' => $current > 0 ? round(($current - (int) ($purchase ?? 0)) / $current * 100, 2) : 0,
                ]);
            }
        }

        $total = count($items);
        $slice = array_slice($items, ($page - 1) * $perPage, $perPage);

        return [
            'currency' => 'IRR',
            'summary' => $summary,
            'price_keys' => ['purchase', 'regular', 'sale', 'current', 'retail', 'credit', 'wholesale', 'installment'],
            'items' => $slice,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'filter' => $filter,
            'category' => $categoryId,
        ];
    }

    /** @param  array<int, array<string, mixed>>  $rows */
    public function toCsv(array $rows, array $headers): string
    {
        $fh = fopen('php://temp', 'r+');
        fputcsv($fh, $headers);
        foreach ($rows as $row) {
            $line = [];
            foreach ($headers as $h) {
                $line[] = is_scalar($row[$h] ?? '') ? $row[$h] : json_encode($row[$h] ?? '', JSON_UNESCAPED_UNICODE);
            }
            fputcsv($fh, $line);
        }
        rewind($fh);
        $csv = stream_get_contents($fh) ?: '';
        fclose($fh);

        return $csv;
    }
}
