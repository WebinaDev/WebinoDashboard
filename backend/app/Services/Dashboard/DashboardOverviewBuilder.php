<?php

namespace App\Services\Dashboard;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductReview;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use App\Services\Analytics\AnalyticsQuery;
use App\Services\Reports\OrderReports;
use App\Services\Sms\ModirPayamakClient;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * Aggregated admin home overview (parity with WP Webino_Dashboard_Home_Overview).
 */
final class DashboardOverviewBuilder
{
    public const SMS_LOW_BALANCE = 10000;

    public const CACHE_TTL = 90;

    public const SMS_PANEL_CACHE_TTL = 300;

    public function __construct(
        private readonly OrderReports $reports,
        private readonly AnalyticsQuery $analytics,
        private readonly ModirPayamakClient $sms,
    ) {}

    /** @return array<string, mixed> */
    public function build(User $user, string $locale = 'fa'): array
    {
        $tid = (int) $user->tenant_id;
        $cacheKey = "dashboard:overview:v1:{$tid}:{$user->id}:".md5($locale);

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $tid, $locale) {
            return $this->buildPayload($user, $tid, $locale);
        });
    }

    /** @return array<string, mixed> */
    public function smsPanel(User $user, bool $forceRefresh = false): array
    {
        $tid = (int) $user->tenant_id;
        $cacheKey = "dashboard:sms_panel:{$tid}:{$user->id}";

        if (! $forceRefresh) {
            $cached = Cache::get($cacheKey);
            if (is_array($cached)) {
                return $cached;
            }
        }

        if (! $this->moduleEnabled($tid, 'marketing') && ! $this->moduleEnabled($tid, 'sms')) {
            $panel = $this->smsPlaceholder();
            Cache::put($cacheKey, $panel, self::SMS_PANEL_CACHE_TTL);

            return $panel;
        }

        $tenant = $user->tenant ?? Tenant::query()->find($tid);
        if (! $tenant) {
            return $this->smsPlaceholder();
        }

        try {
            $res = $this->sms->get($tenant, 'account');
            $data = is_array($res['data'] ?? null) ? $res['data'] : [];
            if (! ($res['ok'] ?? false) || ($data['unavailable'] ?? false)) {
                $panel = $this->smsPlaceholder();
                Cache::put($cacheKey, $panel, self::SMS_PANEL_CACHE_TTL);

                return $panel;
            }
            $account = is_array($data['account'] ?? null) ? $data['account'] : $data;
            $balance = isset($account['balance']) ? (float) $account['balance'] : null;
            $panel = [
                'provider' => 'dashboard',
                'balance' => $balance,
                'unavailable' => $balance === null,
                'low_balance' => $balance !== null && $balance < self::SMS_LOW_BALANCE,
                'status' => (string) ($account['status'] ?? ''),
                'default_from' => (string) ($account['default_from'] ?? $account['from'] ?? ''),
                'price_per_unit' => (float) ($account['price_per_unit'] ?? $account['unit_price'] ?? 0),
            ];
            Cache::put($cacheKey, $panel, self::SMS_PANEL_CACHE_TTL);

            return $panel;
        } catch (\Throwable) {
            $panel = $this->smsPlaceholder();
            Cache::put($cacheKey, $panel, self::SMS_PANEL_CACHE_TTL);

            return $panel;
        }
    }

    /** @return array<string, mixed> */
    private function buildPayload(User $user, int $tid, string $locale): array
    {
        $sections = [];
        $payload = [
            'generated_at' => time(),
            'locale' => $locale,
        ];

        $shopActive = $this->moduleEnabled($tid, 'catalog') || $this->moduleEnabled($tid, 'commerce');
        $analyticsActive = $this->moduleEnabled($tid, 'analytics') || $this->moduleEnabled($tid, 'dashboard');

        if ($shopActive) {
            try {
                $payload['products'] = $this->productsSection($tid);
                $sections[] = 'products';
            } catch (\Throwable) {
            }
        }

        $panels = $this->panelsSection($user, $tid, $shopActive, $analyticsActive);
        $payload['panels'] = $panels;
        $sections[] = 'panels';

        if ($shopActive) {
            try {
                $payload['sales'] = $this->salesSection($tid, $locale);
                $sections[] = 'sales';
            } catch (\Throwable) {
            }

            try {
                $payload['tasks'] = $this->tasksSection($tid, $payload['products'] ?? null);
                $sections[] = 'tasks';
            } catch (\Throwable) {
            }

            try {
                $payload['fulfillment'] = $this->fulfillmentSection($tid);
                $sections[] = 'fulfillment';
            } catch (\Throwable) {
            }

            try {
                $payload['comments'] = $this->commentsSection($tid);
                if (($payload['comments']['counts']['hold'] ?? 0) > 0 || ($payload['comments']['items'] ?? []) !== []) {
                    $sections[] = 'comments';
                }
            } catch (\Throwable) {
            }
        }

        if ($analyticsActive) {
            try {
                $payload['traffic'] = $this->trafficSection($tid);
                if (($payload['traffic']['active'] ?? false) || ($payload['traffic']['online'] ?? 0) > 0) {
                    $sections[] = 'traffic';
                }
            } catch (\Throwable) {
                $payload['traffic'] = [
                    'active' => false,
                    'source' => 'native',
                    'online' => 0,
                    'highlight' => [
                        'visitors' => 0,
                        'views' => 0,
                        'visitors_change_pct' => null,
                        'views_change_pct' => null,
                    ],
                    'periods' => [],
                    'all_time' => [
                        'id' => 'all',
                        'from' => '',
                        'to' => '',
                        'visitors' => 0,
                        'views' => 0,
                        'visitors_change_pct' => null,
                        'views_change_pct' => null,
                    ],
                ];
            }
        }

        try {
            $alerts = $this->alertsSection($panels);
            if ($alerts !== []) {
                $payload['alerts'] = $alerts;
                $sections[] = 'alerts';
            }
        } catch (\Throwable) {
        }

        $payload['sections'] = array_values(array_unique($sections));

        return $payload;
    }

    /** @return array<string, mixed> */
    private function productsSection(int $tid): array
    {
        $byStatus = Product::query()
            ->where('tenant_id', $tid)
            ->selectRaw('status, COUNT(*) as cnt')
            ->groupBy('status')
            ->pluck('cnt', 'status')
            ->map(fn ($v) => (int) $v)
            ->all();

        $total = array_sum($byStatus);

        $byStock = [
            'instock' => 0,
            'outofstock' => 0,
            'onbackorder' => 0,
        ];
        $products = Product::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', ['publish', 'published'])
            ->get(['stock', 'stock_status', 'manage_stock']);
        foreach ($products as $p) {
            $st = (string) ($p->stock_status ?: '');
            if ($st === '' || $st === '0') {
                $st = ((int) ($p->stock ?? 0) > 0) ? 'instock' : 'outofstock';
            }
            $key = match ($st) {
                'instock', 'in_stock' => 'instock',
                'onbackorder', 'on_backorder' => 'onbackorder',
                default => 'outofstock',
            };
            $byStock[$key]++;
        }

        // Map published → publish for WP-compatible UI keys
        $mappedStatus = [];
        foreach ($byStatus as $status => $n) {
            $key = match ((string) $status) {
                'published', 'publish' => 'publish',
                'draft' => 'draft',
                'pending' => 'pending',
                'private' => 'private',
                'trash', 'trashed' => 'trash',
                default => (string) $status,
            };
            $mappedStatus[$key] = ($mappedStatus[$key] ?? 0) + (int) $n;
        }

        return [
            'total' => $total,
            'by_status' => $mappedStatus,
            'by_stock' => $byStock,
        ];
    }

    /** @return array<string, mixed> */
    private function panelsSection(User $user, int $tid, bool $shopActive, bool $analyticsActive): array
    {
        $tenant = $user->tenant ?? Tenant::query()->find($tid);
        $licenseActive = filled($tenant?->license_key);
        $online = 0;
        if ($analyticsActive) {
            try {
                $online = $this->analytics->onlineCount($tid);
            } catch (\Throwable) {
                $online = 0;
            }
        }

        $panels = [
            'license' => [
                'active' => $licenseActive,
                'demo' => ! $licenseActive,
                'status' => $licenseActive ? 'valid' : '',
            ],
            'woocommerce' => [
                'active' => $shopActive,
            ],
            'analytics' => [
                'active' => $analyticsActive,
                'online' => $online,
            ],
        ];

        if ($this->moduleEnabled($tid, 'marketing') || $this->moduleEnabled($tid, 'sms')) {
            $panels['sms'] = $this->smsPanelCachedPlaceholder($user);
        }

        return $panels;
    }

    /** @return array<string, mixed> */
    private function smsPanelCachedPlaceholder(User $user): array
    {
        $cacheKey = "dashboard:sms_panel:{$user->tenant_id}:{$user->id}";
        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        return $this->smsPlaceholder();
    }

    /** @return array<string, mixed> */
    private function smsPlaceholder(): array
    {
        return [
            'provider' => 'dashboard',
            'balance' => null,
            'unavailable' => true,
            'low_balance' => false,
            'status' => '',
            'default_from' => '',
            'price_per_unit' => 0.0,
        ];
    }

    /** @return array<string, mixed> */
    private function salesSection(int $tid, string $locale): array
    {
        $toTs = time();
        $fromTs = $toTs - 30 * 86400;
        $statuses = OrderReports::SALES_STATUSES;
        $report = $this->reports->buildReport($tid, $fromTs, $toTs, 'day', $statuses);
        $prev = $this->reports->compareRange($fromTs, $toTs);
        $compare = $this->reports->buildReport($tid, $prev['from_ts'], $prev['to_ts'], 'day', $statuses);

        $currency = (string) ($report['currency'] ?? 'IRR');
        $monthLabel = Carbon::createFromTimestamp($fromTs)
            ->locale($locale === 'fa' ? 'fa' : 'en')
            ->isoFormat('D MMM').' – '.Carbon::createFromTimestamp($toTs)
            ->locale($locale === 'fa' ? 'fa' : 'en')
            ->isoFormat('D MMM YYYY');

        $recentOrders = Order::query()
            ->where('tenant_id', $tid)
            ->with(['user:id,name,email', 'items'])
            ->orderByDesc('id')
            ->limit(8)
            ->get()
            ->map(fn (Order $o) => $this->orderRow($o))
            ->all();

        $recentProducts = Product::query()
            ->where('tenant_id', $tid)
            ->orderByDesc('id')
            ->limit(8)
            ->get()
            ->map(fn (Product $p) => $this->productRow($p))
            ->all();

        $topByViews = Product::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', ['publish', 'published'])
            ->orderByDesc('views_count')
            ->limit(8)
            ->get()
            ->map(fn (Product $p) => array_merge($this->productRow($p), [
                'views' => (int) ($p->views_count ?? 0),
            ]))
            ->all();

        $topProducts = array_map(function ($row) {
            return [
                'id' => $row['product_id'] ?? $row['id'] ?? null,
                'product_id' => $row['product_id'] ?? $row['id'] ?? null,
                'name' => (string) ($row['name'] ?? ''),
                'quantity' => (int) ($row['quantity'] ?? 0),
                'revenue' => (int) ($row['revenue'] ?? 0),
                'image_url' => '',
                'views' => 0,
            ];
        }, array_slice($report['top_products'] ?? [], 0, 8));

        $topCategories = array_map(function ($row) {
            return [
                'term_id' => (int) ($row['term_id'] ?? 0),
                'name' => (string) ($row['name'] ?? ''),
                'quantity' => (int) ($row['quantity'] ?? 0),
                'revenue' => (int) ($row['revenue'] ?? 0),
            ];
        }, array_slice($report['top_categories'] ?? [], 0, 8));

        $topCustomers = array_map(function ($row) {
            return [
                'customer_id' => (int) ($row['customer_id'] ?? $row['user_id'] ?? 0),
                'name' => (string) ($row['name'] ?? ''),
                'email' => (string) ($row['email'] ?? ''),
                'orders' => (int) ($row['orders'] ?? 0),
                'revenue' => (int) ($row['revenue'] ?? 0),
            ];
        }, array_slice($report['top_customers'] ?? [], 0, 8));

        return [
            'currency' => $currency,
            'from' => $fromTs,
            'to' => $toTs,
            'range' => 'last30',
            'month_label' => $monthLabel,
            'summary' => $report['summary'],
            'compare_summary' => $compare['summary'],
            'series' => $report['series'],
            'compare_series' => $compare['series'],
            'by_status' => $report['by_status'] ?? [],
            'by_payment' => $report['by_payment'] ?? [],
            'by_hour' => $report['by_hour'] ?? [],
            'recent_orders' => $recentOrders,
            'recent_products' => $recentProducts,
            'top_products' => $topProducts,
            'top_products_by_views' => $topByViews,
            'top_categories' => $topCategories,
            'top_customers' => $topCustomers,
        ];
    }

    /**
     * @param  array<string, mixed>|null  $products
     * @return array<string, mixed>
     */
    private function tasksSection(int $tid, ?array $products): array
    {
        $holdReviews = ProductReview::query()
            ->where('tenant_id', $tid)
            ->where('status', 'pending')
            ->count();

        return [
            'comments_hold' => [
                'count' => $holdReviews,
                'href' => '/dashboard/settings/shop/reviews',
            ],
            'orders_processing' => $this->taskOrdersBlock($tid, 'processing'),
            'orders_on_hold' => $this->taskOrdersBlock($tid, 'on_hold'),
            'products_outofstock' => [
                'count' => (int) ($products['by_stock']['outofstock'] ?? 0),
                'href' => '/dashboard/products?stock_status=outofstock',
            ],
        ];
    }

    /** @return array{count: int, preview: list<array<string, mixed>>, href: string} */
    private function taskOrdersBlock(int $tid, string $status): array
    {
        $preview = Order::query()
            ->where('tenant_id', $tid)
            ->where('status', $status)
            ->with(['user:id,name,email', 'items'])
            ->orderByDesc('id')
            ->limit(5)
            ->get()
            ->map(fn (Order $o) => $this->orderRow($o))
            ->all();

        $count = Order::query()->where('tenant_id', $tid)->where('status', $status)->count();

        return [
            'count' => $count,
            'preview' => $preview,
            'href' => '/dashboard/orders?status='.rawurlencode($status),
        ];
    }

    /** @return array<string, mixed> */
    private function fulfillmentSection(int $tid): array
    {
        return [
            'pack' => $this->fulfillmentBucket($tid, 'processing', 'pack', '/dashboard/orders?status=processing'),
            'ship' => $this->fulfillmentBucket($tid, 'paid', 'ship', '/dashboard/orders?status=paid'),
            'tracking' => $this->fulfillmentBucket($tid, 'shipped', 'tracking', '/dashboard/orders?status=shipped'),
            'refund' => $this->fulfillmentBucket($tid, 'cancelled', 'refund', '/dashboard/orders?status=cancelled', 14),
            'returns' => [
                'count' => 0,
                'items' => [],
                'href' => '/dashboard/orders',
            ],
        ];
    }

    /**
     * @return array{count: int, items: list<array<string, mixed>>, href: string}
     */
    private function fulfillmentBucket(int $tid, string $status, string $action, string $href, ?int $withinDays = null): array
    {
        $q = Order::query()
            ->where('tenant_id', $tid)
            ->where('status', $status)
            ->with(['user:id,name,email']);
        if ($withinDays !== null) {
            $q->where('created_at', '>=', Carbon::now()->subDays($withinDays));
        }
        $count = (clone $q)->count();
        $items = $q->orderByDesc('id')->limit(8)->get()->map(function (Order $o) use ($action) {
            $meta = is_array($o->meta) ? $o->meta : [];

            return [
                'id' => $o->id,
                'number' => (string) ($o->number ?? $o->id),
                'customer_name' => (string) ($o->customer_name ?: $o->user?->name ?: $o->user?->email ?: '—'),
                'status' => (string) $o->status,
                'status_label' => (string) $o->status,
                'href' => '/dashboard/orders/'.$o->id,
                'action' => $action,
                'shipping_kind' => (string) ($meta['shipping_kind'] ?? ''),
                'shipping_label' => (string) ($meta['shipping_label'] ?? ''),
                'purchase_type' => (string) ($meta['purchase_type'] ?? ''),
                'payment_method_title' => (string) ($o->payment_provider ?? ''),
            ];
        })->all();

        return ['count' => $count, 'items' => $items, 'href' => $href];
    }

    /** @return array{items: list<array<string, mixed>>, counts: array{hold: int, approved: int, spam: int, trash: int}} */
    private function commentsSection(int $tid): array
    {
        $hold = ProductReview::query()->where('tenant_id', $tid)->where('status', 'pending')->count();
        $approved = ProductReview::query()->where('tenant_id', $tid)->where('status', 'approved')->count();
        $items = ProductReview::query()
            ->where('tenant_id', $tid)
            ->where('status', 'pending')
            ->with(['product:id,name', 'user:id,name'])
            ->orderByDesc('id')
            ->limit(8)
            ->get()
            ->map(fn (ProductReview $r) => [
                'id' => $r->id,
                'author_name' => (string) ($r->author_name ?: $r->user?->name ?: '—'),
                'content' => (string) ($r->body ?? ''),
                'status' => (string) $r->status,
                'date' => optional($r->created_at)?->toIso8601String() ?? '',
                'post_title' => (string) ($r->product?->name ?? ''),
                'post_id' => (int) ($r->product_id ?? 0),
                'rating' => (int) ($r->rating ?? 0),
                'href' => '/dashboard/settings/shop/reviews',
            ])
            ->all();

        return [
            'items' => $items,
            'counts' => [
                'hold' => $hold,
                'approved' => $approved,
                'spam' => 0,
                'trash' => 0,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function trafficSection(int $tid): array
    {
        $to = Carbon::now()->format('Y-m-d');
        $from = Carbon::now()->subDays(29)->format('Y-m-d');
        $overview = $this->analytics->overview($tid, $from, $to);
        $online = (int) ($overview['online'] ?? 0);
        $series = is_array($overview['series'] ?? null) ? $overview['series'] : [];

        $highlightFrom = Carbon::now()->subDays(7)->format('Y-m-d');
        $highlightTo = Carbon::now()->subDay()->format('Y-m-d');
        $highlight = $this->analytics->overview($tid, $highlightFrom, $highlightTo);
        $prevFrom = Carbon::now()->subDays(14)->format('Y-m-d');
        $prevTo = Carbon::now()->subDays(8)->format('Y-m-d');
        $prev = $this->analytics->overview($tid, $prevFrom, $prevTo);

        $visitorsChange = $this->changePct((int) ($highlight['visitors'] ?? 0), (int) ($prev['visitors'] ?? 0));
        $viewsChange = $this->changePct((int) ($highlight['views'] ?? 0), (int) ($prev['views'] ?? 0));

        $periods = [
            $this->trafficPeriod('today', Carbon::now()->format('Y-m-d'), Carbon::now()->format('Y-m-d'), $tid),
            $this->trafficPeriod('yesterday', Carbon::yesterday()->format('Y-m-d'), Carbon::yesterday()->format('Y-m-d'), $tid),
            [
                'id' => 'last7',
                'from' => $highlightFrom,
                'to' => $highlightTo,
                'visitors' => (int) ($highlight['visitors'] ?? 0),
                'views' => (int) ($highlight['views'] ?? 0),
                'visitors_change_pct' => $visitorsChange,
                'views_change_pct' => $viewsChange,
            ],
        ];

        return [
            'active' => true,
            'source' => 'native',
            'online' => $online,
            'highlight' => [
                'visitors' => (int) ($highlight['visitors'] ?? 0),
                'views' => (int) ($highlight['views'] ?? 0),
                'visitors_change_pct' => $visitorsChange,
                'views_change_pct' => $viewsChange,
            ],
            'periods' => $periods,
            'all_time' => [
                'id' => 'all',
                'from' => '',
                'to' => '',
                'visitors' => (int) ($overview['visitors'] ?? 0),
                'views' => (int) ($overview['views'] ?? 0),
                'visitors_change_pct' => null,
                'views_change_pct' => null,
            ],
            'chart' => [
                'series' => array_map(fn ($row) => [
                    'day' => (string) ($row['day'] ?? $row['label'] ?? ''),
                    'visitors' => (int) ($row['visitors'] ?? 0),
                    'views' => (int) ($row['views'] ?? 0),
                ], $series),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function trafficPeriod(string $id, string $from, string $to, int $tid): array
    {
        $data = $this->analytics->overview($tid, $from, $to);

        return [
            'id' => $id,
            'from' => $from,
            'to' => $to,
            'visitors' => (int) ($data['visitors'] ?? 0),
            'views' => (int) ($data['views'] ?? 0),
            'visitors_change_pct' => null,
            'views_change_pct' => null,
        ];
    }

    /**
     * @param  array<string, mixed>  $panels
     * @return list<array<string, mixed>>
     */
    private function alertsSection(array $panels): array
    {
        $alerts = [];
        $sms = $panels['sms'] ?? null;
        if (is_array($sms) && ($sms['low_balance'] ?? false)) {
            $alerts[] = [
                'level' => 'warning',
                'source' => 'sms',
                'message' => 'SMS balance is low',
                'at' => now()->toIso8601String(),
            ];
        }
        if (is_array($sms) && ($sms['unavailable'] ?? false)) {
            // Don't spam unavailable as alert on every load — mini card already shows it.
        }
        if (! ($panels['license']['active'] ?? false)) {
            $alerts[] = [
                'level' => 'warning',
                'source' => 'license',
                'message' => 'License inactive',
                'at' => now()->toIso8601String(),
            ];
        }

        return $alerts;
    }

    /** @return array<string, mixed> */
    private function orderRow(Order $o): array
    {
        return [
            'id' => $o->id,
            'number' => (string) ($o->number ?? $o->id),
            'status' => (string) $o->status,
            'status_label' => (string) $o->status,
            'total' => (string) ((int) $o->total_minor),
            'date' => optional($o->created_at)?->toIso8601String() ?? '',
            'customer_name' => (string) ($o->customer_name ?: $o->user?->name ?: $o->user?->email ?: '—'),
            'item_count' => $o->relationLoaded('items') ? $o->items->sum('quantity') : 0,
        ];
    }

    /** @return array<string, mixed> */
    private function productRow(Product $p): array
    {
        return [
            'id' => $p->id,
            'product_id' => $p->id,
            'name' => (string) $p->name,
            'status' => (string) $p->status,
            'price' => (string) ((int) ($p->price_minor ?? 0)),
            'date' => optional($p->created_at)?->toIso8601String() ?? '',
            'image_url' => (string) ($p->image_url ?: $p->cover_image_url ?: ''),
            'views' => (int) ($p->views_count ?? 0),
        ];
    }

    private function moduleEnabled(int $tid, string $slug): bool
    {
        $row = TenantModule::query()
            ->where('tenant_id', $tid)
            ->where('module_slug', $slug)
            ->first();

        return $row ? (bool) $row->enabled : $slug === 'dashboard' || $slug === 'core';
    }

    private function changePct(int $current, int $previous): ?float
    {
        if ($previous <= 0) {
            return $current > 0 ? 100.0 : null;
        }

        return round(($current - $previous) / $previous * 100, 1);
    }
}
