<?php

namespace App\Services\Reports;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderReturn;
use App\Models\Product;
use App\Models\ProductDownloadLog;
use App\Models\ProductVariant;
use App\Models\Tenant;
use App\Services\Marketplace\MarketplacePlatforms;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Pricing\PricingCalculator;
use App\Services\Pricing\PurchaseTypeService;
use App\Services\Shop\ShopSettings;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Shop order / inventory reports (port of Webino_Dashboard_Order_Reports + Webino_Dashboard_Inventory_Reports).
 */
final class OrderReports
{
    public const SALES_EXCLUDE = [
        'pending_payment', 'awaiting_gateway', 'on_hold', 'payment_failed',
        'cancelled', 'refunded', 'failed',
        'webino-returned', 'webino-deleted', 'webino-need-review',
    ];

    /** @deprecated Use {@see self::salesStatuses()}. */
    public const SALES_STATUSES = ['paid', 'processing', 'shipped', 'completed'];

    public const MAX_ORDERS = 10000;

    public const REFUND_RETURN_STATUSES = ['approved', 'refunded', 'completed'];

    public const PRICE_TIERS = ['retail', 'credit', 'installment', 'wholesale'];

    public const STOCK_FILTERS = ['all', 'instock', 'outofstock', 'onbackorder', 'lowstock', 'missing_cost'];

    /** section => [report key, default orderby] */
    public const LIST_SECTIONS = [
        'products' => ['products', 'profit'],
        'variations' => ['variations', 'profit'],
        'categories' => ['categories', 'profit'],
        'brands' => ['brands', 'profit'],
        'coupons' => ['coupons', 'count'],
        'taxes' => ['taxes', 'total'],
        'customers' => ['customers', 'revenue'],
        'downloads' => ['downloads', 'downloads'],
    ];

    public const SEARCH_KEYS = ['name', 'code', 'email', 'label'];

    /** Statuses that count as a sale: every order status except unpaid / cancelled / refunded / returned / review. */
    public static function salesStatuses(): array
    {
        return array_values(array_diff(Order::STATUSES, self::SALES_EXCLUDE));
    }

    /** @return array{from_ts: int, to_ts: int, from: string, to: string, from_date: string, to_date: string, interval: string, statuses: list<string>, compare: bool} */
    public function parseRequest(Request $request): array
    {
        $toTs = $request->filled('to') ? (int) $request->query('to') : time();
        $fromTs = $request->filled('from') ? (int) $request->query('from') : ($toTs - 30 * 86400);
        if ($fromTs > $toTs) {
            [$fromTs, $toTs] = [$toTs, $fromTs];
        }
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
        $parts = array_values(array_intersect(Order::STATUSES, $parts));

        return $parts !== [] ? $parts : self::salesStatuses();
    }

    /** @return array{from_ts: int, to_ts: int, from_date: string, to_date: string, from: string, to: string} */
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

    public function tenantCurrency(int $tenantId): string
    {
        $currency = (string) (Tenant::query()->whereKey($tenantId)->value('default_currency') ?? '');
        if ($currency === '') {
            $currency = (string) (ShopSettings::getGeneral($tenantId)['currency'] ?? 'IRT');
        }

        return strtoupper($currency !== '' ? $currency : 'IRT');
    }

    public function wfcpEnabled(int $tenantId): bool
    {
        return PurchaseTypeService::forTenant($tenantId)->active();
    }

    public function targetMarginPct(int $tenantId): float
    {
        if (! $this->wfcpEnabled($tenantId)) {
            return 0.0;
        }

        return (float) (PricingCalculator::forTenant($tenantId)->section('retail')['profit_percent'] ?? 0);
    }

    // ── Section payloads ────────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function sectionPayload(int $tenantId, string $section, Request $request): array
    {
        if ($section === 'stock') {
            return $this->stock($tenantId, $this->stockOptions($request));
        }

        $p = $this->parseRequest($request);
        $report = $this->buildReport($tenantId, $p['from_ts'], $p['to_ts'], $p['interval'], $p['statuses']);
        $data = $this->basePayload($report, $section);

        if ($p['compare']) {
            $prev = $this->compareRange($p['from_ts'], $p['to_ts']);
            $cmp = $this->buildReport($tenantId, $prev['from_ts'], $prev['to_ts'], $p['interval'], $p['statuses']);
            $data['compare'] = [
                'from' => $cmp['from'],
                'to' => $cmp['to'],
                'from_date' => $cmp['from_date'],
                'to_date' => $cmp['to_date'],
                'summary' => $cmp['summary'],
                'series' => $cmp['series'],
            ];
        }

        if (isset(self::LIST_SECTIONS[$section])) {
            [$key, $defaultOrderby] = self::LIST_SECTIONS[$section];

            return array_merge($data, $this->paginateRows($report[$key] ?? [], $request, $defaultOrderby));
        }

        return match ($section) {
            'overview', 'orders' => array_merge($data, [
                'by_status' => $report['by_status'],
                'by_payment' => $report['by_payment'],
                'by_source' => $report['by_source'],
                'by_hour' => $report['by_hour'],
                'heatmap' => $report['heatmap'],
                'by_price_tier' => $report['by_price_tier'],
                'top_products' => $report['top_products'],
                'top_products_profit' => $report['top_products_profit'],
                'top_categories' => $report['top_categories'],
                'top_customers' => $report['top_customers'],
                'top_coupons' => $report['top_coupons'],
            ]),
            'sales' => array_merge($data, [
                'by_price_tier' => $report['by_price_tier'],
            ], $this->paginateRows($this->salesItems($report), $request, 'profit')),
            'financial' => array_merge($data, [
                'by_payment' => $report['by_payment'],
                'by_source' => $report['by_source'],
                'by_status' => $report['by_status'],
                'by_price_tier' => $report['by_price_tier'],
                'by_utm_source' => $report['by_utm_source'],
                'by_utm_medium' => $report['by_utm_medium'],
                'by_utm_campaign' => $report['by_utm_campaign'],
                'by_utm' => $report['by_utm'],
                'orders_filtered' => $this->paginateOrders($this->filterOrders($report['orders_lite'], $request), $request),
            ]),
            default => $data,
        };
    }

    /**
     * @param  array<string, mixed>  $report
     * @return array<string, mixed>
     */
    private function basePayload(array $report, string $section): array
    {
        return [
            'currency' => $report['currency'],
            'from' => $report['from'],
            'to' => $report['to'],
            'from_date' => $report['from_date'],
            'to_date' => $report['to_date'],
            'interval' => $report['interval'],
            'statuses' => $report['statuses'],
            'section' => $section,
            'truncated' => $report['truncated'],
            'summary' => $report['summary'],
            'series' => $report['series'],
        ];
    }

    /**
     * @param  array<string, mixed>  $report
     * @return list<array<string, mixed>>
     */
    private function salesItems(array $report): array
    {
        return array_map(fn (array $r) => [
            'id' => $r['id'],
            'name' => $r['name'],
            'quantity' => $r['quantity'],
            'avg_cost' => $r['avg_cost'],
            'avg_sell_price' => $r['avg_sell_price'],
            'revenue' => $r['revenue'],
            'cogs' => $r['cogs'],
            'profit' => $r['profit'],
            'margin_pct' => $r['margin_pct'],
        ], $report['products'] ?? []);
    }

    /**
     * Search + sort + paginate (port of paginate_rows).
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  list<string>  $searchKeys
     * @return array{items: list<array<string, mixed>>, total: int, page: int, per_page: int}
     */
    public function paginateRows(array $rows, Request $request, string $defaultOrderby = '', array $searchKeys = self::SEARCH_KEYS, bool $paginate = true): array
    {
        $rows = $this->sortAndSearch($rows, $request, $defaultOrderby, $searchKeys);
        $page = max(1, (int) ($request->query('page') ?: 1));
        $perPage = $this->perPage($request);
        $total = count($rows);

        return [
            'items' => $paginate ? array_values(array_slice($rows, ($page - 1) * $perPage, $perPage)) : $rows,
            'total' => $total,
            'page' => $paginate ? $page : 1,
            'per_page' => $paginate ? $perPage : $total,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @param  list<string>  $searchKeys
     * @return list<array<string, mixed>>
     */
    private function sortAndSearch(array $rows, Request $request, string $defaultOrderby, array $searchKeys): array
    {
        $search = mb_strtolower(trim((string) $request->query('search', '')));
        if ($search !== '') {
            $rows = array_values(array_filter($rows, function ($row) use ($search, $searchKeys) {
                foreach ($searchKeys as $k) {
                    if (isset($row[$k]) && is_scalar($row[$k]) && str_contains(mb_strtolower((string) $row[$k]), $search)) {
                        return true;
                    }
                }

                return false;
            }));
        }

        $orderby = (string) ($request->query('orderby') ?: $defaultOrderby);
        if ($orderby !== '' && ($rows === [] || array_key_exists($orderby, $rows[0]))) {
            $asc = strtolower((string) $request->query('order', 'desc')) === 'asc';
            usort($rows, function ($a, $b) use ($orderby, $asc) {
                $cmp = $this->compareValues($a[$orderby] ?? 0, $b[$orderby] ?? 0);

                return $asc ? $cmp : -$cmp;
            });
        }

        return array_values($rows);
    }

    private function compareValues(mixed $av, mixed $bv): int
    {
        if (is_numeric($av) && is_numeric($bv)) {
            return (float) $av <=> (float) $bv;
        }
        if (is_bool($av) || is_bool($bv)) {
            return (int) $av <=> (int) $bv;
        }

        return strcasecmp((string) $av, (string) $bv);
    }

    private function perPage(Request $request): int
    {
        $per = (int) ($request->query('per_page') ?: 25);

        return min(100, max(1, $per));
    }

    /**
     * @param  list<array<string, mixed>>  $orders
     * @return list<array<string, mixed>>
     */
    private function filterOrders(array $orders, Request $request): array
    {
        $norm = function (string $key) use ($request): ?string {
            if (! $request->filled($key)) {
                return null;
            }
            $v = (string) $request->query($key);

            return in_array($v, ['(direct/none)', '__none__'], true) ? '' : $v;
        };
        $pay = $norm('payment_method');
        $us = $norm('utm_source');
        $um = $norm('utm_medium');
        $uc = $norm('utm_campaign');
        $search = mb_strtolower(trim((string) $request->query('search', '')));

        return array_values(array_filter($orders, function ($row) use ($pay, $us, $um, $uc, $search) {
            if ($pay !== null && $row['payment_method'] !== $pay) {
                return false;
            }
            if ($us !== null && $row['utm_source'] !== $us) {
                return false;
            }
            if ($um !== null && $row['utm_medium'] !== $um) {
                return false;
            }
            if ($uc !== null && $row['utm_campaign'] !== $uc) {
                return false;
            }
            if ($search !== '') {
                $hay = mb_strtolower($row['number'].' '.$row['customer_name'].' '.$row['payment_title'].' '.$row['utm_source']);
                if (! str_contains($hay, $search)) {
                    return false;
                }
            }

            return true;
        }));
    }

    /**
     * @param  list<array<string, mixed>>  $orders
     * @return array{items: list<array<string, mixed>>, total: int, page: int, per_page: int}
     */
    private function paginateOrders(array $orders, Request $request): array
    {
        $page = max(1, (int) ($request->query('page') ?: 1));
        $perPage = $this->perPage($request);

        return [
            'items' => array_values(array_slice($orders, ($page - 1) * $perPage, $perPage)),
            'total' => count($orders),
            'page' => $page,
            'per_page' => $perPage,
        ];
    }

    // ── Report builder ─────────────────────────────────────────────────

    /**
     * @param  list<string>  $statuses
     * @return array<string, mixed>
     */
    public function buildReport(int $tenantId, int $fromTs, int $toTs, string $interval, array $statuses): array
    {
        $orders = $this->loadOrders($tenantId, $fromTs, $toTs, $statuses);
        $agg = $this->aggregate($tenantId, $orders, $fromTs, $toTs, $interval);

        return array_merge([
            'currency' => $this->tenantCurrency($tenantId),
            'from' => date('c', $fromTs),
            'to' => date('c', $toTs),
            'from_date' => date('Y-m-d', $fromTs),
            'to_date' => date('Y-m-d', $toTs),
            'interval' => $interval,
            'statuses' => $statuses,
            'truncated' => $orders->count() >= self::MAX_ORDERS,
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
            ->whereBetween('created_at', $this->utcRange($fromTs, $toTs))
            ->with(['items.product.category', 'items.product.categories', 'items.product.brands', 'items.variant', 'user:id,name,email'])
            ->orderBy('created_at')
            ->limit(self::MAX_ORDERS)
            ->get();
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function utcRange(int $fromTs, int $toTs): array
    {
        return [Carbon::createFromTimestamp($fromTs)->utc(), Carbon::createFromTimestamp($toTs)->utc()];
    }

    private function tz(): string
    {
        $tz = (string) config('app.timezone');

        return $tz === '' || $tz === 'UTC' ? 'Asia/Tehran' : $tz;
    }

    private function local(mixed $dt): Carbon
    {
        $c = $dt instanceof \DateTimeInterface ? Carbon::instance($dt) : Carbon::parse($dt);

        return $c->copy()->timezone($this->tz());
    }

    private function bucketKey(mixed $createdAt, string $interval): string
    {
        $dt = $this->local($createdAt);

        return match ($interval) {
            'week' => $dt->format('o-\WW'),
            'month' => $dt->format('Y-m'),
            default => $dt->format('Y-m-d'),
        };
    }

    /** @return array<string, mixed> */
    private function emptyBucket(string $key): array
    {
        return [
            'key' => $key, 'label' => $key, 'revenue' => 0, 'orders' => 0, 'items' => 0,
            'cogs' => 0, 'profit' => 0, 'refunds' => 0, 'coupons' => 0, 'net' => 0, 'tax' => 0, 'shipping' => 0,
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private function initSeries(int $fromTs, int $toTs, string $interval): array
    {
        $out = [];
        $cur = $this->local(Carbon::createFromTimestamp($fromTs));
        $cur = match ($interval) {
            'week' => $cur->startOfWeek(),
            'month' => $cur->startOfMonth(),
            default => $cur->startOfDay(),
        };
        $end = $this->local(Carbon::createFromTimestamp($toTs));
        for ($n = 0; $cur->lte($end) && $n < 1000; $n++) {
            $key = $this->bucketKey($cur, $interval);
            $out[$key] = $this->emptyBucket($key);
            match ($interval) {
                'week' => $cur->addWeek(),
                'month' => $cur->addMonthNoOverflow(),
                default => $cur->addDay(),
            };
        }

        return $out;
    }

    private static function marginPct(int|float $profit, int|float $revenue): float
    {
        return $revenue > 0 ? round($profit / $revenue * 100, 2) : 0.0;
    }

    /**
     * @param  Collection<int, Order>  $orders
     * @return array<string, mixed>
     */
    private function aggregate(int $tenantId, Collection $orders, int $fromTs, int $toTs, string $interval): array
    {
        $wfcpEnabled = $this->wfcpEnabled($tenantId);
        $calc = PricingCalculator::forTenant($tenantId);
        $wholesaleGateways = $calc->typeEnabled('wholesale') ? $calc->gatewaysFor('wholesale') : [];

        $summary = [
            'revenue' => 0, 'net_revenue' => 0, 'refunds' => 0, 'refund_count' => 0,
            'order_count' => 0, 'avg_order_value' => 0, 'items_sold' => 0,
            'discount_total' => 0, 'shipping_total' => 0, 'tax_total' => 0,
            'cogs' => 0, 'gross_profit' => 0, 'gross_margin_pct' => 0,
            'items_missing_cost' => 0, 'wfcp_enabled' => $wfcpEnabled, 'new_customers' => 0,
            'returning_customers' => 0, 'items_per_order' => 0,
            'target_margin_pct' => $wfcpEnabled ? (float) ($calc->section('retail')['profit_percent'] ?? 0) : 0.0,
        ];
        $lineRevenueTotal = 0;
        $series = $this->initSeries($fromTs, $toTs, $interval);
        $byStatus = [];
        $byPayment = [];
        $bySource = [];
        $byUtmSource = [];
        $byUtmMedium = [];
        $byUtmCampaign = [];
        $byUtm = [];
        $byHour = [];
        for ($h = 0; $h < 24; $h++) {
            $byHour[$h] = ['hour' => $h, 'orders' => 0, 'revenue' => 0];
        }
        $heatmap = [];
        for ($d = 0; $d <= 6; $d++) {
            for ($h = 0; $h < 24; $h++) {
                $heatmap[$d * 24 + $h] = ['dow' => $d, 'hour' => $h, 'orders' => 0, 'revenue' => 0];
            }
        }
        $tiers = [];
        foreach (self::PRICE_TIERS as $t) {
            $tiers[$t] = ['tier' => $t, 'revenue' => 0, 'cogs' => 0, 'count' => 0];
        }
        $products = [];
        $variations = [];
        $categories = [];
        $brands = [];
        $customers = [];
        $coupons = [];
        $taxes = [];
        $ordersLite = [];
        $gatewayTitles = [];
        $newCustomerLookup = $this->priorCustomerLookup($tenantId, $orders, $fromTs);

        foreach ($orders as $order) {
            $rev = (int) $order->total_minor;
            $discount = (int) $order->discount_minor;
            $shipping = (int) $order->shipping_minor;
            $tax = (int) ($order->tax_minor ?? 0);
            $summary['order_count']++;
            $summary['revenue'] += $rev;
            $summary['discount_total'] += $discount;
            $summary['shipping_total'] += $shipping;
            $summary['tax_total'] += $tax;

            $status = (string) $order->status;
            $byStatus[$status] ??= ['status' => $status, 'count' => 0, 'revenue' => 0];
            $byStatus[$status]['count']++;
            $byStatus[$status]['revenue'] += $rev;

            $pay = (string) ($order->payment_provider ?: $order->payment_tender ?: 'unknown');
            $payTitle = $gatewayTitles[$pay] ??= $this->paymentTitle($pay);
            $byPayment[$pay] ??= ['method' => $pay, 'title' => $payTitle, 'count' => 0, 'revenue' => 0, 'cogs' => 0, 'line_revenue' => 0];
            $byPayment[$pay]['count']++;
            $byPayment[$pay]['revenue'] += $rev;

            $src = (string) ($order->sales_channel ?: 'site');
            $bySource[$src] ??= ['source' => $src, 'count' => 0, 'revenue' => 0];
            $bySource[$src]['count']++;
            $bySource[$src]['revenue'] += $rev;

            $us = (string) ($order->utm_source ?? '');
            $um = (string) ($order->utm_medium ?? '');
            $uc = (string) ($order->utm_campaign ?? '');
            self::bumpDim($byUtmSource, $us, $rev);
            self::bumpDim($byUtmMedium, $um, $rev);
            self::bumpDim($byUtmCampaign, $uc, $rev);
            $comboKey = $us."\0".$um."\0".$uc;
            $byUtm[$comboKey] ??= ['utm_source' => $us, 'utm_medium' => $um, 'utm_campaign' => $uc, 'count' => 0, 'revenue' => 0, 'cogs' => 0, 'line_revenue' => 0];
            $byUtm[$comboKey]['count']++;
            $byUtm[$comboKey]['revenue'] += $rev;

            $local = $this->local($order->created_at);
            $hour = (int) $local->format('G');
            $dow = (int) $local->format('w');
            $byHour[$hour]['orders']++;
            $byHour[$hour]['revenue'] += $rev;
            $heatmap[$dow * 24 + $hour]['orders']++;
            $heatmap[$dow * 24 + $hour]['revenue'] += $rev;

            $key = $this->bucketKey($order->created_at, $interval);
            $series[$key] ??= $this->emptyBucket($key);
            $series[$key]['orders']++;
            $series[$key]['revenue'] += $rev;
            $series[$key]['shipping'] += $shipping;
            $series[$key]['coupons'] += $discount;
            $series[$key]['tax'] += $tax;

            if ($order->coupon_code) {
                $code = (string) $order->coupon_code;
                $coupons[$code] ??= ['code' => $code, 'count' => 0, 'discount' => 0, 'revenue' => 0];
                $coupons[$code]['count']++;
                $coupons[$code]['revenue'] += $rev;
                $coupons[$code]['discount'] += $discount;
            }

            $meta = is_array($order->meta) ? $order->meta : [];
            $taxLines = is_array($meta['tax_lines'] ?? null) ? $meta['tax_lines'] : [];
            foreach ($taxLines as $line) {
                if (! is_array($line)) {
                    continue;
                }
                $tcode = (string) ($line['code'] ?? '');
                $tname = (string) ($line['name'] ?? $tcode);
                $tkey = $tcode !== '' ? $tcode : 'n:'.$tname;
                $taxes[$tkey] ??= [
                    'name' => $tname, 'code' => $tcode, 'rate' => (float) ($line['rate'] ?? 0),
                    'order_tax' => 0, 'shipping_tax' => 0, 'total' => 0, 'orders' => 0,
                ];
                $ot = (int) ($line['order_tax'] ?? 0);
                $st = (int) ($line['shipping_tax'] ?? 0);
                $taxes[$tkey]['order_tax'] += $ot;
                $taxes[$tkey]['shipping_tax'] += $st;
                $taxes[$tkey]['total'] += $ot + $st;
                $taxes[$tkey]['orders']++;
            }

            $ckey = $this->customerKey($order);
            if (! isset($customers[$ckey])) {
                $isNew = $this->isNewCustomer($order, $newCustomerLookup);
                $summary[$isNew ? 'new_customers' : 'returning_customers']++;
                $customers[$ckey] = [
                    'id' => $order->user_id ? (int) $order->user_id : null,
                    'name' => (string) ($order->customer_name ?: ($order->user?->name ?? '—')),
                    'email' => (string) ($order->customer_email ?: ($order->user?->email ?? '')),
                    'type' => $isNew ? 'new' : 'returning',
                    'orders' => 0,
                    'revenue' => 0,
                    'aov' => 0,
                ];
            }
            $customers[$ckey]['orders']++;
            $customers[$ckey]['revenue'] += $rev;

            $orderCogs = 0;
            $orderLineRev = 0;
            foreach ($order->items as $item) {
                $qty = (int) $item->quantity;
                $lineRev = (int) $item->unit_price_minor * $qty;
                $unitCost = $this->unitCost($item);
                $missing = $unitCost === null || $unitCost <= 0;
                $cogs = $unitCost === null ? 0 : $unitCost * $qty;
                $profit = $lineRev - $cogs;
                $orderCogs += $cogs;
                $orderLineRev += $lineRev;
                $lineRevenueTotal += $lineRev;
                $summary['items_sold'] += $qty;
                $summary['cogs'] += $cogs;
                if ($missing) {
                    $summary['items_missing_cost'] += $qty;
                }
                $series[$key]['items'] += $qty;
                $series[$key]['cogs'] += $cogs;
                $series[$key]['profit'] += $profit;

                $tier = $this->priceTier($order, $item, $wholesaleGateways);
                $tiers[$tier] ??= ['tier' => $tier, 'revenue' => 0, 'cogs' => 0, 'count' => 0];
                $tiers[$tier]['count']++;
                $tiers[$tier]['revenue'] += $lineRev;
                $tiers[$tier]['cogs'] += $cogs;

                $pid = (int) ($item->product_id ?: 0);
                $pkey = $pid ?: ('name:'.$item->product_name);
                $products[$pkey] ??= [
                    'id' => $pid ?: null, 'name' => (string) ($item->product_name ?: $item->product?->name ?: '—'),
                    'quantity' => 0, 'revenue' => 0, 'cogs' => 0, 'missing_cost_qty' => 0,
                ];
                $products[$pkey]['quantity'] += $qty;
                $products[$pkey]['revenue'] += $lineRev;
                $products[$pkey]['cogs'] += $cogs;
                $products[$pkey]['missing_cost_qty'] += $missing ? $qty : 0;

                if ($item->product_variant_id) {
                    $vid = (int) $item->product_variant_id;
                    $vname = trim((string) ($item->product_name ?: $item->product?->name ?: '—'));
                    if ($item->variant?->name && ! str_contains($vname, (string) $item->variant->name)) {
                        $vname .= ' - '.$item->variant->name;
                    }
                    $variations[$vid] ??= ['id' => $vid, 'name' => $vname, 'quantity' => 0, 'revenue' => 0, 'cogs' => 0];
                    $variations[$vid]['quantity'] += $qty;
                    $variations[$vid]['revenue'] += $lineRev;
                    $variations[$vid]['cogs'] += $cogs;
                }

                foreach ($this->productTerms($item->product, 'categories') as $termId => $termName) {
                    $categories[$termId] ??= ['id' => $termId ?: null, 'name' => $termName, 'quantity' => 0, 'revenue' => 0, 'cogs' => 0];
                    $categories[$termId]['quantity'] += $qty;
                    $categories[$termId]['revenue'] += $lineRev;
                    $categories[$termId]['cogs'] += $cogs;
                }
                foreach ($this->productTerms($item->product, 'brands') as $termId => $termName) {
                    $brands[$termId] ??= ['id' => $termId, 'name' => $termName, 'quantity' => 0, 'revenue' => 0, 'cogs' => 0];
                    $brands[$termId]['quantity'] += $qty;
                    $brands[$termId]['revenue'] += $lineRev;
                    $brands[$termId]['cogs'] += $cogs;
                }
            }

            $byPayment[$pay]['cogs'] += $orderCogs;
            $byPayment[$pay]['line_revenue'] += $orderLineRev;
            self::addDimCosts($byUtmSource, $us, $orderCogs, $orderLineRev);
            self::addDimCosts($byUtmMedium, $um, $orderCogs, $orderLineRev);
            self::addDimCosts($byUtmCampaign, $uc, $orderCogs, $orderLineRev);
            $byUtm[$comboKey]['cogs'] += $orderCogs;
            $byUtm[$comboKey]['line_revenue'] += $orderLineRev;

            $ordersLite[] = [
                'id' => (int) $order->id,
                'number' => (string) ($order->number ?: $order->id),
                'created_at' => $order->created_at ? Carbon::parse($order->created_at)->toIso8601String() : null,
                'customer_name' => (string) ($order->customer_name ?: ($order->user?->name ?? '')),
                'status' => $status,
                'payment_method' => $pay,
                'payment_title' => $payTitle,
                'utm_source' => $us,
                'utm_medium' => $um,
                'utm_campaign' => $uc,
                'total' => $rev,
            ];
        }

        $this->applyRefunds($tenantId, $fromTs, $toTs, $interval, $summary, $series);

        foreach ($series as &$bucket) {
            $bucket['net'] = max(0, $bucket['revenue'] - $bucket['refunds']);
        }
        unset($bucket);
        ksort($series);

        $summary['net_revenue'] = max(0, $summary['revenue'] - $summary['refunds']);
        $summary['gross_profit'] = $lineRevenueTotal - $summary['cogs'];
        $summary['gross_margin_pct'] = self::marginPct($summary['gross_profit'], $lineRevenueTotal);
        $summary['avg_order_value'] = $summary['order_count'] > 0
            ? (int) round($summary['revenue'] / $summary['order_count']) : 0;
        $summary['items_per_order'] = $summary['order_count'] > 0
            ? round($summary['items_sold'] / $summary['order_count'], 2) : 0;

        $byRevenue = fn ($a, $b) => $b['revenue'] <=> $a['revenue'];

        $productRows = array_values(array_map(function ($r) {
            $profit = $r['revenue'] - $r['cogs'];

            return [
                'id' => $r['id'],
                'name' => $r['name'],
                'quantity' => $r['quantity'],
                'avg_sell_price' => $r['quantity'] > 0 ? (int) round($r['revenue'] / $r['quantity']) : 0,
                'avg_cost' => $r['quantity'] > 0 ? (int) round($r['cogs'] / $r['quantity']) : 0,
                'revenue' => $r['revenue'],
                'cogs' => $r['cogs'],
                'profit' => $profit,
                'margin_pct' => self::marginPct($profit, $r['revenue']),
                'missing_cost_qty' => $r['missing_cost_qty'],
            ];
        }, $products));
        usort($productRows, fn ($a, $b) => $b['profit'] <=> $a['profit']);

        $variationRows = array_values(array_map(fn ($r) => [
            'id' => $r['id'], 'name' => $r['name'], 'quantity' => $r['quantity'], 'revenue' => $r['revenue'],
            'cogs' => $r['cogs'], 'profit' => $r['revenue'] - $r['cogs'],
            'margin_pct' => self::marginPct($r['revenue'] - $r['cogs'], $r['revenue']),
        ], $variations));
        usort($variationRows, fn ($a, $b) => $b['profit'] <=> $a['profit']);

        $termRows = function (array $rows): array {
            $out = array_values(array_map(fn ($r) => [
                'id' => $r['id'], 'name' => $r['name'], 'quantity' => $r['quantity'], 'revenue' => $r['revenue'],
                'profit' => $r['revenue'] - $r['cogs'],
                'margin_pct' => self::marginPct($r['revenue'] - $r['cogs'], $r['revenue']),
            ], $rows));
            usort($out, fn ($a, $b) => $b['profit'] <=> $a['profit']);

            return $out;
        };
        $categoryRows = $termRows($categories);
        $brandRows = $termRows($brands);

        $customerRows = array_values(array_map(function ($c) {
            $c['aov'] = $c['orders'] > 0 ? (int) round($c['revenue'] / $c['orders']) : 0;

            return $c;
        }, $customers));
        usort($customerRows, $byRevenue);

        $couponRows = array_values($coupons);
        usort($couponRows, fn ($a, $b) => $b['count'] <=> $a['count']);

        $taxRows = array_values($taxes);
        usort($taxRows, fn ($a, $b) => $b['total'] <=> $a['total']);

        $tierRows = array_values(array_map(fn ($r) => [
            'tier' => $r['tier'], 'revenue' => $r['revenue'], 'profit' => $r['revenue'] - $r['cogs'], 'count' => $r['count'],
        ], $tiers));
        usort($tierRows, $byRevenue);

        $topProducts = array_map(fn ($r) => [
            'id' => $r['id'], 'name' => $r['name'], 'quantity' => $r['quantity'], 'revenue' => $r['revenue'],
        ], $productRows);
        usort($topProducts, $byRevenue);
        $topCategories = array_map(fn ($r) => [
            'id' => $r['id'], 'name' => $r['name'], 'quantity' => $r['quantity'], 'revenue' => $r['revenue'],
        ], $categoryRows);
        usort($topCategories, $byRevenue);

        $byStatusRows = array_values($byStatus);
        usort($byStatusRows, $byRevenue);
        $bySourceRows = array_values($bySource);
        usort($bySourceRows, $byRevenue);

        return [
            'summary' => $summary,
            'series' => array_values($series),
            'by_status' => $byStatusRows,
            'by_payment' => $this->finalizeFinanceRows($byPayment, true),
            'by_source' => $bySourceRows,
            'by_utm_source' => $this->finalizeFinanceRows($byUtmSource, true),
            'by_utm_medium' => $this->finalizeFinanceRows($byUtmMedium, true),
            'by_utm_campaign' => $this->finalizeFinanceRows($byUtmCampaign, true),
            'by_utm' => $this->finalizeFinanceRows($byUtm, false),
            'by_hour' => array_values($byHour),
            'heatmap' => array_values($heatmap),
            'by_price_tier' => $tierRows,
            'top_products' => array_slice($topProducts, 0, 10),
            'top_products_profit' => array_slice(array_map(fn ($r) => [
                'id' => $r['id'], 'name' => $r['name'], 'quantity' => $r['quantity'], 'revenue' => $r['revenue'],
                'cogs' => $r['cogs'], 'profit' => $r['profit'], 'margin_pct' => $r['margin_pct'],
                'missing_cost_qty' => $r['missing_cost_qty'],
            ], $productRows), 0, 10),
            'top_categories' => array_slice($topCategories, 0, 10),
            'top_customers' => array_slice(array_map(fn ($c) => [
                'name' => $c['name'], 'email' => $c['email'], 'orders' => $c['orders'], 'revenue' => $c['revenue'],
            ], $customerRows), 0, 10),
            'top_coupons' => array_slice($couponRows, 0, 10),
            'products' => $productRows,
            'variations' => $variationRows,
            'categories' => $categoryRows,
            'brands' => $brandRows,
            'customers' => $customerRows,
            'coupons' => $couponRows,
            'taxes' => $taxRows,
            'downloads' => $this->downloads($tenantId, $fromTs, $toTs),
            'orders_lite' => array_reverse($ordersLite),
        ];
    }

    /** @param  array<string, array<string, mixed>>  $rows */
    private static function bumpDim(array &$rows, string $value, int $revenue): void
    {
        $rows[$value] ??= ['value' => $value, 'count' => 0, 'revenue' => 0, 'cogs' => 0, 'line_revenue' => 0];
        $rows[$value]['count']++;
        $rows[$value]['revenue'] += $revenue;
    }

    /** @param  array<string, array<string, mixed>>  $rows */
    private static function addDimCosts(array &$rows, string $value, int $cogs, int $lineRevenue): void
    {
        $rows[$value]['cogs'] += $cogs;
        $rows[$value]['line_revenue'] += $lineRevenue;
    }

    /**
     * @param  array<string, array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function finalizeFinanceRows(array $rows, bool $withAov): array
    {
        $out = [];
        foreach ($rows as $row) {
            $line = (int) $row['line_revenue'];
            unset($row['line_revenue']);
            $row['profit'] = $line - (int) $row['cogs'];
            $row['margin_pct'] = self::marginPct($row['profit'], $line);
            if ($withAov) {
                $row['avg_order_value'] = $row['count'] > 0 ? (int) round($row['revenue'] / $row['count']) : 0;
            }
            $out[] = $row;
        }
        usort($out, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);

        return $out;
    }

    /**
     * Refunds = approved/refunded returns in range + orders with status "refunded" (not already covered by a return).
     *
     * @param  array<string, mixed>  $summary
     * @param  array<string, array<string, mixed>>  $series
     */
    private function applyRefunds(int $tenantId, int $fromTs, int $toTs, string $interval, array &$summary, array &$series): void
    {
        $range = $this->utcRange($fromTs, $toTs);
        $returns = OrderReturn::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', self::REFUND_RETURN_STATUSES)
            ->whereBetween('created_at', $range)
            ->get(['id', 'order_id', 'refund_minor', 'created_at']);
        $coveredOrders = [];
        foreach ($returns as $ret) {
            $amount = (int) ($ret->refund_minor ?? 0);
            $coveredOrders[(int) $ret->order_id] = true;
            if ($amount <= 0) {
                continue;
            }
            $summary['refunds'] += $amount;
            $summary['refund_count']++;
            $key = $this->bucketKey($ret->created_at, $interval);
            $series[$key] ??= $this->emptyBucket($key);
            $series[$key]['refunds'] += $amount;
        }

        $refundedOrders = Order::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'refunded')
            ->whereBetween('created_at', $range)
            ->get(['id', 'total_minor', 'created_at']);
        foreach ($refundedOrders as $o) {
            if (isset($coveredOrders[(int) $o->id])) {
                continue;
            }
            $amount = (int) $o->total_minor;
            $summary['refunds'] += $amount;
            $summary['refund_count']++;
            $key = $this->bucketKey($o->created_at, $interval);
            $series[$key] ??= $this->emptyBucket($key);
            $series[$key]['refunds'] += $amount;
        }
    }

    private function paymentTitle(string $slug): string
    {
        $defaults = app(PaymentGatewaySettingsService::class)->defaultsFor($slug);
        $title = (string) ($defaults['title'] ?? $defaults['title_ipg'] ?? '');

        return $title !== '' ? $title : $slug;
    }

    private function customerKey(Order $order): string
    {
        if ($order->user_id) {
            return 'u_'.$order->user_id;
        }
        if ($order->customer_email) {
            return 'e_'.mb_strtolower((string) $order->customer_email);
        }
        if ($order->customer_phone) {
            return 'p_'.$order->customer_phone;
        }

        return 'g_'.$order->id;
    }

    /**
     * Customers with any order (any status) before the period start.
     *
     * @param  Collection<int, Order>  $orders
     * @return array{users: array<int, true>, emails: array<string, true>, phones: array<string, true>}
     */
    private function priorCustomerLookup(int $tenantId, Collection $orders, int $fromTs): array
    {
        $before = Carbon::createFromTimestamp($fromTs)->utc();
        $userIds = $orders->pluck('user_id')->filter()->unique()->values()->all();
        $emails = $orders->whereNull('user_id')->pluck('customer_email')->filter()->map(fn ($e) => mb_strtolower((string) $e))->unique()->values()->all();
        $phones = $orders->whereNull('user_id')->pluck('customer_phone')->filter()->unique()->values()->all();

        $base = fn () => Order::query()->where('tenant_id', $tenantId)->where('created_at', '<', $before);
        $out = ['users' => [], 'emails' => [], 'phones' => []];
        foreach (array_chunk($userIds, 500) as $chunk) {
            foreach ($base()->whereIn('user_id', $chunk)->distinct()->pluck('user_id') as $id) {
                $out['users'][(int) $id] = true;
            }
        }
        foreach (array_chunk($emails, 500) as $chunk) {
            foreach ($base()->whereIn('customer_email', $chunk)->distinct()->pluck('customer_email') as $e) {
                $out['emails'][mb_strtolower((string) $e)] = true;
            }
        }
        foreach (array_chunk($phones, 500) as $chunk) {
            foreach ($base()->whereIn('customer_phone', $chunk)->distinct()->pluck('customer_phone') as $p) {
                $out['phones'][(string) $p] = true;
            }
        }

        return $out;
    }

    /** @param  array{users: array<int, true>, emails: array<string, true>, phones: array<string, true>}  $lookup */
    private function isNewCustomer(Order $order, array $lookup): bool
    {
        if ($order->user_id) {
            return ! isset($lookup['users'][(int) $order->user_id]);
        }
        if ($order->customer_email) {
            return ! isset($lookup['emails'][mb_strtolower((string) $order->customer_email)]);
        }
        if ($order->customer_phone) {
            return ! isset($lookup['phones'][(string) $order->customer_phone]);
        }

        return true;
    }

    /** @param  list<string>  $wholesaleGateways */
    private function priceTier(Order $order, OrderItem $item, array $wholesaleGateways): string
    {
        $channel = (string) ($order->sales_channel ?? '');
        if ($channel !== '' && MarketplacePlatforms::exists($channel)) {
            return 'marketplace:'.$channel;
        }
        $orderMeta = is_array($order->meta) ? $order->meta : [];
        $platform = (string) ($orderMeta['marketplace_platform'] ?? '');
        if ($platform !== '' && MarketplacePlatforms::exists($platform)) {
            return 'marketplace:'.$platform;
        }
        $pay = (string) ($order->payment_provider ?? '');
        if ($pay !== '' && $wholesaleGateways !== [] && in_array($pay, $wholesaleGateways, true)) {
            return 'wholesale';
        }
        $itemMeta = is_array($item->meta) ? $item->meta : [];
        $type = (string) ($itemMeta['price_type'] ?? $itemMeta['wfcp_purchase_type'] ?? $item->purchase_type ?? $orderMeta['wfcp_purchase_type'] ?? '');

        return in_array($type, ['credit', 'installment', 'wholesale'], true) ? $type : 'retail';
    }

    /** @return array<int|string, string> */
    private function productTerms(?Product $product, string $relation): array
    {
        if (! $product) {
            return $relation === 'categories' ? [0 => '—'] : [];
        }
        $out = [];
        foreach ($product->{$relation} ?? [] as $term) {
            $out[(int) $term->id] = (string) $term->name;
        }
        if ($relation === 'categories' && $out === []) {
            if ($product->category) {
                $out[(int) $product->category->id] = (string) $product->category->name;
            } else {
                $out[0] = '—';
            }
        }

        return $out;
    }

    /** @return list<array{product_id: int, name: string, downloads: int}> */
    private function downloads(int $tenantId, int $fromTs, int $toTs): array
    {
        $rows = ProductDownloadLog::query()
            ->where('tenant_id', $tenantId)
            ->whereBetween('downloaded_at', $this->utcRange($fromTs, $toTs))
            ->selectRaw('product_id, COUNT(*) as downloads')
            ->groupBy('product_id')
            ->orderByDesc('downloads')
            ->limit(500)
            ->get();
        $names = Product::query()->whereIn('id', $rows->pluck('product_id')->all())->pluck('name', 'id');

        return $rows->map(fn ($r) => [
            'product_id' => (int) $r->product_id,
            'name' => (string) ($names[(int) $r->product_id] ?? ('#'.$r->product_id)),
            'downloads' => (int) $r->downloads,
        ])->values()->all();
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

    // ── Stock ──────────────────────────────────────────────────────────

    /** @return array{filter: string, category: int|null, search: string, orderby: string, order: string, page: int, per_page: int} */
    public function stockOptions(Request $request): array
    {
        $filter = (string) ($request->query('stock_filter') ?: $request->query('filter') ?: 'all');
        if ($filter === 'low') {
            $filter = 'lowstock';
        }
        if (! in_array($filter, self::STOCK_FILTERS, true)) {
            $filter = 'all';
        }

        return [
            'filter' => $filter,
            'category' => $request->filled('category') && (int) $request->query('category') > 0 ? (int) $request->query('category') : null,
            'search' => trim((string) $request->query('search', '')),
            'orderby' => (string) ($request->query('orderby') ?: 'name'),
            'order' => strtolower((string) $request->query('order', 'asc')) === 'desc' ? 'desc' : 'asc',
            'page' => max(1, (int) ($request->query('page') ?: 1)),
            'per_page' => $this->perPage($request),
        ];
    }

    /**
     * @param  array{filter?: string, category?: int|null, search?: string, orderby?: string, order?: string, page?: int, per_page?: int}  $opts
     * @return array<string, mixed>
     */
    public function stock(int $tenantId, array $opts = [], bool $paginate = true): array
    {
        $filter = $opts['filter'] ?? 'all';
        $categoryId = $opts['category'] ?? null;
        $search = mb_strtolower((string) ($opts['search'] ?? ''));
        $page = (int) ($opts['page'] ?? 1);
        $perPage = (int) ($opts['per_page'] ?? 25);

        $threshold = max(0, (int) (ShopSettings::getProducts($tenantId)['low_stock_threshold'] ?? 2));
        $wfcpEnabled = $this->wfcpEnabled($tenantId);
        $calc = PricingCalculator::forTenant($tenantId);
        $platforms = MarketplacePlatforms::slugs();

        $summary = [
            'sku_count' => 0, 'units_in_stock' => 0, 'outofstock_count' => 0, 'low_stock_count' => 0,
            'missing_cost_count' => 0, 'value_purchase' => 0, 'value_retail' => 0, 'value_current' => 0,
            'value_wholesale' => 0, 'value_credit' => 0, 'potential_profit' => 0,
            'wfcp_enabled' => $wfcpEnabled,
            'target_margin_pct' => $wfcpEnabled ? (float) ($calc->section('retail')['profit_percent'] ?? 0) : 0.0,
            'low_stock_threshold' => $threshold,
        ];

        $q = Product::query()->where('tenant_id', $tenantId)->with('variants');
        if ($categoryId) {
            $q->where(function ($w) use ($categoryId) {
                $w->where('category_id', $categoryId)
                    ->orWhereHas('categories', fn ($c) => $c->where('categories.id', $categoryId));
            });
        }

        $rows = [];
        foreach ($q->orderBy('name')->orderBy('id')->lazy(500) as $p) {
            $entries = $p->variants->isNotEmpty()
                ? $p->variants->map(fn (ProductVariant $v) => [$p, $v])->all()
                : [[$p, null]];
            foreach ($entries as [$product, $variant]) {
                $row = $this->stockRow($product, $variant, $threshold, $wfcpEnabled, $calc, $platforms);
                if ($search !== '' && ! str_contains(mb_strtolower($row['name']), $search) && ! str_contains(mb_strtolower($row['sku']), $search)) {
                    continue;
                }
                if (! $this->stockRowMatches($row, $filter)) {
                    continue;
                }
                $rows[] = $row;
                $summary['sku_count']++;
                $summary['units_in_stock'] += $row['stock_qty'];
                if ($row['stock_status'] === 'outofstock') {
                    $summary['outofstock_count']++;
                }
                if ($row['is_low_stock']) {
                    $summary['low_stock_count']++;
                }
                if ($row['missing_cost']) {
                    $summary['missing_cost_count']++;
                }
                $summary['value_purchase'] += $row['values']['purchase'];
                $summary['value_retail'] += $row['values']['retail'];
                $summary['value_current'] += $row['values']['current'];
                $summary['value_wholesale'] += $row['values']['wholesale'];
                $summary['value_credit'] += $row['values']['credit'];
                $summary['potential_profit'] += $row['potential_profit'];
            }
        }

        $rows = $this->sortStockRows($rows, (string) ($opts['orderby'] ?? 'name'), (string) ($opts['order'] ?? 'asc'));
        $total = count($rows);

        return [
            'currency' => $this->tenantCurrency($tenantId),
            'summary' => $summary,
            'price_keys' => array_merge(['purchase', 'regular', 'sale', 'current', 'retail', 'credit', 'wholesale', 'installment'], $platforms),
            'items' => $paginate ? array_values(array_slice($rows, ($page - 1) * $perPage, $perPage)) : $rows,
            'total' => $total,
            'page' => $paginate ? $page : 1,
            'per_page' => $paginate ? $perPage : $total,
            'filter' => $filter,
            'category' => $categoryId,
        ];
    }

    /**
     * @param  list<string>  $platforms
     * @return array<string, mixed>
     */
    private function stockRow(Product $p, ?ProductVariant $v, int $threshold, bool $wfcpEnabled, PricingCalculator $calc, array $platforms): array
    {
        $manage = (bool) ($v ? $v->manage_stock : $p->manage_stock);
        $rawStatus = (string) (($v ? $v->stock_status : $p->stock_status) ?? '');
        $rawQty = (int) (($v ? $v->stock : $p->stock) ?? 0);
        $status = match ($rawStatus) {
            'instock', 'in_stock' => 'instock',
            'onbackorder', 'on_backorder' => 'onbackorder',
            'outofstock', 'out_of_stock' => 'outofstock',
            default => $manage ? ($rawQty > 0 ? 'instock' : 'outofstock') : 'instock',
        };
        if ($manage && $rawQty <= 0 && $status === 'instock') {
            $status = 'outofstock';
        }
        $qty = max(0, $manage ? $rawQty : ($status === 'instock' ? 1 : 0));
        $isLow = $manage && $qty > 0 && $qty <= $threshold;

        $purchaseRaw = $v?->purchase_price_minor ?? $p->purchase_price_minor;
        $purchase = max(0, (int) ($purchaseRaw ?? 0));
        $regular = (int) ($v ? ($v->price_minor ?: $p->price_minor) : $p->price_minor);
        $sale = (int) (($v ? $v->sale_price_minor : $p->sale_price_minor) ?? 0);
        $current = $p->effectivePriceMinor($v);

        $prices = [
            'purchase' => $purchase, 'regular' => $regular, 'sale' => $sale, 'current' => $current,
            'retail' => 0, 'credit' => 0, 'wholesale' => 0, 'installment' => 0,
        ];
        $context = $v ?? $p;
        if ($wfcpEnabled && $purchase > 0) {
            $prices['retail'] = (int) round($calc->calculate($purchase, 'retail', [], $context));
            $prices['credit'] = (int) round($calc->calculate($purchase, 'credit', [], $context));
            $prices['wholesale'] = (int) round($calc->calculate($purchase, 'wholesale', [], $context));
            $prices['installment'] = (int) round($calc->calculate($purchase, 'installment', ['months' => $calc->defaultInstallmentMonths()], $context));
            foreach ($platforms as $platform) {
                $prices[$platform] = (int) round($calc->calculate($purchase, $platform, [], $context));
            }
        } else {
            $prices['retail'] = $regular > 0 ? $regular : $current;
            foreach ($platforms as $platform) {
                $prices[$platform] = 0;
            }
        }

        $sell = $prices['retail'] > 0 ? $prices['retail'] : $current;
        $name = $v ? trim($p->name.' - '.($v->name ?: '')) : (string) $p->name;

        return [
            'id' => (int) ($v?->id ?? $p->id),
            'parent_id' => $v ? (int) $p->id : 0,
            'name' => $name,
            'sku' => (string) (($v ? $v->sku : $p->sku) ?: ''),
            'type' => $v ? 'variation' : (string) ($p->type ?: 'simple'),
            'manage_stock' => $manage,
            'stock_qty' => $qty,
            'stock_status' => $status,
            'is_low_stock' => $isLow,
            'missing_cost' => $purchase <= 0,
            'prices' => $prices,
            'values' => [
                'purchase' => $purchase * $qty,
                'retail' => $prices['retail'] * $qty,
                'current' => $current * $qty,
                'wholesale' => $prices['wholesale'] * $qty,
                'credit' => $prices['credit'] * $qty,
            ],
            'potential_profit' => ($sell - $purchase) * $qty,
            'potential_margin' => $sell > 0 ? round(($sell - $purchase) / $sell * 100, 2) : 0,
        ];
    }

    /** @param  array<string, mixed>  $row */
    private function stockRowMatches(array $row, string $filter): bool
    {
        return match ($filter) {
            'outofstock' => $row['stock_status'] === 'outofstock',
            'onbackorder' => $row['stock_status'] === 'onbackorder',
            'lowstock' => $row['is_low_stock'],
            'missing_cost' => $row['missing_cost'],
            'instock' => $row['stock_status'] === 'instock',
            default => true,
        };
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function sortStockRows(array $rows, string $orderby, string $order): array
    {
        $flat = ['id', 'name', 'sku', 'type', 'stock_qty', 'stock_status', 'potential_profit', 'potential_margin'];
        $pick = function (array $row) use ($orderby, $flat) {
            if (in_array($orderby, $flat, true)) {
                return $row[$orderby] ?? '';
            }
            if (str_starts_with($orderby, 'price_')) {
                return $row['prices'][substr($orderby, 6)] ?? 0;
            }
            if (str_starts_with($orderby, 'value_')) {
                return $row['values'][substr($orderby, 6)] ?? 0;
            }

            return $row['name'];
        };
        usort($rows, function ($a, $b) use ($pick, $order) {
            $cmp = $this->compareValues($pick($a), $pick($b));

            return $order === 'desc' ? -$cmp : $cmp;
        });

        return $rows;
    }

    // ── CSV ────────────────────────────────────────────────────────────

    public const CSV_BOM = "\xEF\xBB\xBF";

    public function exportCsv(int $tenantId, string $section, Request $request): string
    {
        if ($section === 'stock') {
            return $this->stockCsv($tenantId, $request);
        }

        $p = $this->parseRequest($request);
        $report = $this->buildReport($tenantId, $p['from_ts'], $p['to_ts'], $p['interval'], $p['statuses']);

        if (in_array($section, ['overview', 'orders'], true)) {
            return $this->blocksCsv([
                $this->summaryBlock($report['summary']),
                array_merge([['Date', 'Revenue', 'Orders', 'Items', 'COGS', 'Profit']], array_map(
                    fn ($r) => [$r['label'], $r['revenue'], $r['orders'], $r['items'], $r['cogs'], $r['profit']],
                    $report['series']
                )),
                array_merge([['Top products'], ['Name', 'Quantity', 'Revenue']], array_map(
                    fn ($r) => [$r['name'], $r['quantity'], $r['revenue']],
                    $report['top_products']
                )),
                array_merge([['Top products by profit'], ['Name', 'Quantity', 'Revenue', 'COGS', 'Profit']], array_map(
                    fn ($r) => [$r['name'], $r['quantity'], $r['revenue'], $r['cogs'], $r['profit']],
                    $report['top_products_profit']
                )),
                array_merge([['Heatmap (day x hour)'], ['dow', 'hour', 'Orders', 'Revenue']], array_map(
                    fn ($r) => [$r['dow'], $r['hour'], $r['orders'], $r['revenue']],
                    array_values(array_filter($report['heatmap'], fn ($r) => $r['orders'] > 0))
                )),
            ]);
        }

        if ($section === 'financial') {
            $orders = $this->filterOrders($report['orders_lite'], $request);

            return $this->blocksCsv([
                $this->summaryBlock($report['summary']),
                array_merge([['Payment method', 'Title', 'Orders', 'Revenue', 'COGS', 'Profit', 'Margin %', 'AOV']], array_map(
                    fn ($r) => [$r['method'], $r['title'], $r['count'], $r['revenue'], $r['cogs'], $r['profit'], $r['margin_pct'], $r['avg_order_value']],
                    $report['by_payment']
                )),
                array_merge([['UTM Source', 'UTM Medium', 'UTM Campaign', 'Orders', 'Revenue', 'COGS', 'Profit', 'Margin %', 'AOV']], array_map(
                    fn ($r) => [$r['utm_source'], $r['utm_medium'], $r['utm_campaign'], $r['count'], $r['revenue'], $r['cogs'], $r['profit'], $r['margin_pct'],
                        $r['count'] > 0 ? (int) round($r['revenue'] / $r['count']) : 0],
                    $report['by_utm']
                )),
                $orders === [] ? [] : array_merge([['Order', 'Date', 'Status', 'Customer', 'Total', 'Payment', 'UTM Source', 'UTM Medium', 'UTM Campaign']], array_map(
                    fn ($r) => [$r['number'], $r['created_at'], $r['status'], $r['customer_name'], $r['total'], $r['payment_title'], $r['utm_source'], $r['utm_medium'], $r['utm_campaign']],
                    $orders
                )),
            ]);
        }

        if ($section === 'revenue') {
            return $this->rowsCsv($report['series']);
        }
        if ($section === 'sales') {
            return $this->rowsCsv($this->paginateRows($this->salesItems($report), $request, 'profit', self::SEARCH_KEYS, false)['items']);
        }
        if (isset(self::LIST_SECTIONS[$section])) {
            [$key, $defaultOrderby] = self::LIST_SECTIONS[$section];

            return $this->rowsCsv($this->paginateRows($report[$key] ?? [], $request, $defaultOrderby, self::SEARCH_KEYS, false)['items']);
        }

        return $this->rowsCsv($report['series']);
    }

    private function stockCsv(int $tenantId, Request $request): string
    {
        $data = $this->stock($tenantId, $this->stockOptions($request), false);
        $platforms = MarketplacePlatforms::slugs();
        $header = array_merge(
            ['ID', 'SKU', 'Name', 'Type', 'Stock', 'Status', 'Purchase', 'Regular', 'Sale', 'Current', 'Retail', 'Credit', 'Wholesale', 'Installment'],
            $platforms,
            ['Value purchase', 'Value retail', 'Value current', 'Value wholesale', 'Value credit', 'Potential profit']
        );
        $rows = [$header];
        foreach ($data['items'] as $r) {
            $pr = $r['prices'];
            $line = [
                $r['id'], $r['sku'], $r['name'], $r['type'], $r['stock_qty'], $r['stock_status'],
                $pr['purchase'], $pr['regular'], $pr['sale'], $pr['current'], $pr['retail'], $pr['credit'], $pr['wholesale'], $pr['installment'],
            ];
            foreach ($platforms as $platform) {
                $line[] = $pr[$platform] ?? 0;
            }
            $rows[] = array_merge($line, [
                $r['values']['purchase'], $r['values']['retail'], $r['values']['current'], $r['values']['wholesale'], $r['values']['credit'], $r['potential_profit'],
            ]);
        }

        return $this->blocksCsv([$rows]);
    }

    /**
     * @param  array<string, mixed>  $summary
     * @return list<list<mixed>>
     */
    private function summaryBlock(array $summary): array
    {
        $rows = [['Metric', 'Value']];
        foreach ($summary as $k => $v) {
            $rows[] = [$k, $v];
        }

        return $rows;
    }

    /** @param  list<array<string, mixed>>  $items */
    private function rowsCsv(array $items): string
    {
        if ($items === []) {
            return self::CSV_BOM;
        }
        $headers = array_keys($items[0]);

        return self::CSV_BOM.$this->toCsv($items, $headers);
    }

    /** @param  list<list<list<mixed>>>  $blocks */
    private function blocksCsv(array $blocks): string
    {
        $fh = fopen('php://temp', 'r+');
        $first = true;
        foreach ($blocks as $block) {
            if ($block === []) {
                continue;
            }
            if (! $first) {
                fputcsv($fh, []);
            }
            $first = false;
            foreach ($block as $row) {
                fputcsv($fh, array_map(fn ($v) => $this->csvValue($v), $row));
            }
        }
        rewind($fh);
        $csv = stream_get_contents($fh) ?: '';
        fclose($fh);

        return self::CSV_BOM.$csv;
    }

    private function csvValue(mixed $v): string|int|float
    {
        if (is_bool($v)) {
            return $v ? 1 : 0;
        }
        if ($v === null) {
            return '';
        }

        return is_scalar($v) ? $v : (json_encode($v, JSON_UNESCAPED_UNICODE) ?: '');
    }

    /** @param  array<int, array<string, mixed>>  $rows */
    public function toCsv(array $rows, array $headers): string
    {
        $fh = fopen('php://temp', 'r+');
        fputcsv($fh, $headers);
        foreach ($rows as $row) {
            $line = [];
            foreach ($headers as $h) {
                $line[] = $this->csvValue($row[$h] ?? '');
            }
            fputcsv($fh, $line);
        }
        rewind($fh);
        $csv = stream_get_contents($fh) ?: '';
        fclose($fh);

        return $csv;
    }
}
