<?php

namespace App\Services\Dashboard;

use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Product;
use App\Models\ProductReview;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use App\Services\Analytics\AnalyticsQuery;
use App\Services\Orders\OrderShippingStatuses;
use App\Services\Reports\OrderReports;
use App\Services\Sms\ModirPayamakClient;
use App\Support\CapabilityChecker;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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
        $cacheKey = "dashboard:overview:v1:{$tid}:a".AnalyticsQuery::cacheVersion($tid).":{$user->id}:".md5($locale);

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

        $caps = app(CapabilityChecker::class);
        $canCatalog = $caps->allows($user, 'catalog.manage') || $caps->allows($user, 'commerce.*') || $caps->allows($user, 'catalog.*') || (string) $user->role === 'admin';
        $canSales = $caps->allows($user, 'reports.shop') || $caps->allows($user, 'orders.*') || (string) $user->role === 'admin';
        $canOrders = $caps->allows($user, 'orders.*') || $caps->allows($user, 'orders.own') || (string) $user->role === 'admin';
        $canReviews = $caps->allows($user, 'reviews.moderate') || (string) $user->role === 'admin';
        $canPortal = $caps->allows($user, 'account.portal') || $caps->allows($user, 'partner.portal');
        $isPartner = $caps->allows($user, 'partner.portal');

        $shopActive = ($this->moduleEnabled($tid, 'catalog') || $this->moduleEnabled($tid, 'commerce')) && ($canCatalog || $canSales || $canOrders);
        $analyticsActive = $this->moduleEnabled($tid, 'analytics') || $this->moduleEnabled($tid, 'dashboard');

        if ($shopActive && $canCatalog) {
            try {
                $payload['products'] = $this->productsSection($tid);
                $sections[] = 'products';
            } catch (\Throwable $e) {
                // Soft-fail: expose error for logs/clients but skip section registration
                // so the home UI never renders half-shaped sales/products widgets.
                $payload['products'] = ['error' => $e->getMessage()];
                Log::warning('dashboard.overview.products_failed', [
                    'tenant_id' => $tid,
                    'message' => $e->getMessage(),
                ]);
            }
        }

        $panels = $this->panelsSection($user, $tid, $shopActive, $analyticsActive);
        $payload['panels'] = $panels;
        $sections[] = 'panels';

        if ($shopActive && $canSales) {
            try {
                $payload['sales'] = $this->salesSection($tid, $locale);
                $sections[] = 'sales';
            } catch (\Throwable $e) {
                $payload['sales'] = ['error' => $e->getMessage()];
                Log::warning('dashboard.overview.sales_failed', [
                    'tenant_id' => $tid,
                    'message' => $e->getMessage(),
                ]);
            }
        }

        if ($shopActive && $canOrders) {
            try {
                $payload['tasks'] = $this->tasksSection($tid, $payload['products'] ?? null);
                $sections[] = 'tasks';
            } catch (\Throwable $e) {
                $payload['tasks'] = ['error' => $e->getMessage()];
            }

            try {
                $payload['fulfillment'] = $this->fulfillmentSection($tid, $locale);
                $sections[] = 'fulfillment';
            } catch (\Throwable $e) {
                $payload['fulfillment'] = ['error' => $e->getMessage()];
                Log::warning('dashboard.overview.fulfillment_failed', [
                    'tenant_id' => $tid,
                    'message' => $e->getMessage(),
                ]);
            }
        }

        if ($shopActive && $canReviews) {
            try {
                $payload['comments'] = $this->commentsSection($tid);
                if (($payload['comments']['counts']['hold'] ?? 0) > 0 || ($payload['comments']['items'] ?? []) !== []) {
                    $sections[] = 'comments';
                }
            } catch (\Throwable $e) {
                $payload['comments'] = ['error' => $e->getMessage()];
            }
        }

        // Traffic always present in sections (even when inactive).
        try {
            $payload['traffic'] = $this->trafficSection($tid);
            if (! $analyticsActive) {
                $payload['traffic']['active'] = false;
            }
        } catch (\Throwable $e) {
            $payload['traffic'] = [
                'active' => false,
                'error' => $e->getMessage(),
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
                    'id' => 'all_time',
                    'from' => '',
                    'to' => '',
                    'visitors' => 0,
                    'views' => 0,
                    'visitors_change_pct' => null,
                    'views_change_pct' => null,
                ],
            ];
        }
        $sections[] = 'traffic';

        if ($canPortal && ! $canOrders) {
            try {
                $payload['account'] = $this->accountSection($user, $tid);
                $sections[] = 'account';
                if ($isPartner) {
                    $payload['partner'] = $payload['account'];
                    $sections[] = 'partner';
                }
            } catch (\Throwable $e) {
                $payload['account'] = ['error' => $e->getMessage()];
            }
        }

        try {
            $alerts = $this->alertsSection($panels, $locale);
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
        $stockRows = Product::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', ['publish', 'published'])
            ->selectRaw("CASE
                WHEN stock_status IN ('instock','in_stock') THEN 'instock'
                WHEN stock_status IN ('onbackorder','on_backorder') THEN 'onbackorder'
                WHEN COALESCE(stock_status,'') IN ('','0') AND COALESCE(stock,0) > 0 THEN 'instock'
                ELSE 'outofstock'
            END as stock_key, COUNT(*) as cnt")
            ->groupBy('stock_key')
            ->pluck('cnt', 'stock_key');
        foreach ($stockRows as $key => $cnt) {
            if (isset($byStock[$key])) {
                $byStock[$key] = (int) $cnt;
            }
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
        $licenseActive = $tenant ? $tenant->isLicenseEntitled() : false;
        $licenseStatus = $tenant ? $tenant->normalizedLicenseStatus() : 'unknown';
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
                'demo' => $tenant ? $tenant->isLicenseDemo() : false,
                'status' => $licenseStatus,
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

        $botsEnabled = $this->moduleEnabled($tid, 'bots');
        $botsList = [];
        if ($botsEnabled && \Illuminate\Support\Facades\Schema::hasTable('bot_settings')) {
            try {
                $settings = DB::table('bot_settings')->where('tenant_id', $tid)->get();
                foreach ($settings as $row) {
                    $provider = (string) ($row->provider ?? '');
                    if ($provider === '') {
                        continue;
                    }
                    $sessions = 0;
                    $errors = 0;
                    if (\Illuminate\Support\Facades\Schema::hasTable('bot_sessions')) {
                        $sessions = (int) DB::table('bot_sessions')
                            ->where('tenant_id', $tid)
                            ->where('provider', $provider)
                            ->where('updated_at', '>=', now()->subDay())
                            ->count();
                    }
                    if (\Illuminate\Support\Facades\Schema::hasTable('bot_message_logs')) {
                        $errors = (int) DB::table('bot_message_logs')
                            ->where('tenant_id', $tid)
                            ->where('provider', $provider)
                            ->where('status', 'failed')
                            ->where('created_at', '>=', now()->subDays(7))
                            ->count();
                    }
                    $botsList[] = [
                        'provider' => $provider,
                        'sessions_24h' => $sessions,
                        'users_linked' => 0,
                        'webhook_configured' => (bool) ($row->enabled ?? false),
                        'token_configured' => filled($row->token ?? null),
                        'last_error' => $errors > 0 ? 'errors' : '',
                        'errors_7d' => $errors,
                    ];
                }
            } catch (\Throwable) {
                $botsList = [];
            }
        }
        $panels['bots'] = $botsList;
        $panels['bots_summary'] = [
            'active' => $botsEnabled,
            'errors_7d' => array_sum(array_column($botsList, 'errors_7d')),
        ];

        $secEnabled = $this->moduleEnabled($tid, 'security') || $this->moduleEnabled($tid, 'waf');
        $panels['security'] = [
            'active' => $secEnabled,
            'score' => $secEnabled ? 100 : null,
            'waf_mode' => $secEnabled ? 'monitor' : 'off',
            'open_findings' => 0,
        ];

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
        $now = Carbon::now();
        $fromTs = $now->copy()->startOfMonth()->timestamp;
        $toTs = $now->copy()->endOfMonth()->timestamp;
        $statuses = OrderReports::salesStatuses();
        $report = $this->reports->buildReport($tid, $fromTs, $toTs, 'day', $statuses);
        $prev = $this->reports->compareRange($fromTs, $toTs);
        $compare = $this->reports->buildReport($tid, $prev['from_ts'], $prev['to_ts'], 'day', $statuses);

        $currency = (string) ($report['currency'] ?? 'IRR');
        $monthLabel = Carbon::createFromTimestamp($fromTs)
            ->locale($locale === 'fa' ? 'fa' : 'en')
            ->isoFormat('MMMM YYYY');

        $activeStatuses = [
            'paid', 'processing', 'sent-to-warehouse', 'webino-in-stock', 'webino-packaged',
            'webino-courier', 'webino-post', 'webino-tipax', 'webino-ready-to-ship',
            'webino-shipping', 'shipped', 'webino-need-review',
        ];
        $recentOrders = Order::query()
            ->where('tenant_id', $tid)
            ->where('created_at', '>=', Carbon::createFromTimestamp($fromTs))
            ->whereIn('status', $activeStatuses)
            ->with(['user:id,name,email', 'items'])
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn (Order $o) => $this->orderRow($o, $locale))
            ->all();

        $recentProducts = Product::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', ['publish', 'published'])
            ->orderByDesc('id')
            ->limit(5)
            ->get()
            ->map(fn (Product $p) => $this->productRow($p))
            ->all();

        // Prefer analytics page views when available; fall back to products.views_count.
        $topByViews = Product::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', ['publish', 'published'])
            ->orderByDesc('views_count')
            ->limit(5)
            ->get()
            ->map(fn (Product $p) => array_merge($this->productRow($p), [
                'views' => (int) ($p->views_count ?? 0),
            ]))
            ->all();

        $topProducts = array_map(function ($row) use ($tid) {
            $pid = $row['product_id'] ?? $row['id'] ?? null;
            $image = '';
            if ($pid) {
                $p = Product::query()->where('tenant_id', $tid)->find($pid);
                $image = (string) ($p?->image_url ?: $p?->cover_image_url ?: '');
            }

            return [
                'id' => $pid,
                'product_id' => $pid,
                'name' => (string) ($row['name'] ?? ''),
                'quantity' => (int) ($row['quantity'] ?? 0),
                'revenue' => (int) ($row['revenue'] ?? 0),
                'image_url' => $image,
                'views' => 0,
            ];
        }, array_slice($report['top_products'] ?? [], 0, 5));

        $topCategories = array_map(function ($row) {
            return [
                'term_id' => (int) ($row['id'] ?? $row['term_id'] ?? 0),
                'name' => (string) ($row['name'] ?? ''),
                'quantity' => (int) ($row['quantity'] ?? 0),
                'revenue' => (int) ($row['revenue'] ?? 0),
            ];
        }, array_slice($report['top_categories'] ?? [], 0, 5));

        $topCustomers = array_map(function ($row) {
            return [
                'customer_id' => (int) ($row['id'] ?? 0),
                'name' => (string) ($row['name'] ?? ''),
                'email' => (string) ($row['email'] ?? ''),
                'orders' => (int) ($row['orders'] ?? 0),
                'revenue' => (int) ($row['revenue'] ?? 0),
            ];
        }, array_slice($report['customers'] ?? [], 0, 5));

        return [
            'currency' => $currency,
            'from' => $fromTs,
            'to' => $toTs,
            'range' => 'month',
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
                'href' => '/dashboard/users/comments',
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
    private function fulfillmentSection(int $tid, string $locale = 'fa'): array
    {
        $packStatuses = ['processing', 'sent-to-warehouse', 'webino-in-stock'];
        $shipStatuses = ['webino-packaged'];
        $trackingQ = Order::query()
            ->where('tenant_id', $tid)
            ->where('status', 'completed')
            ->where(function ($q) {
                $q->whereNull('meta->tracking_code')
                    ->where(function ($q2) {
                        $q2->whereNull('meta->tapin->barcode')
                            ->orWhere('meta->tapin->barcode', '');
                    });
            });

        $returnsCount = OrderReturn::query()->where('tenant_id', $tid)->whereIn('status', ['requested', 'approved'])->count();
        $returnItems = OrderReturn::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', ['requested', 'approved'])
            ->orderByDesc('id')
            ->limit(8)
            ->get()
            ->map(fn (OrderReturn $r) => [
                'id' => $r->id,
                'order_id' => $r->order_id,
                'status' => (string) $r->status,
                'reason' => (string) ($r->reason ?? ''),
                'href' => '/dashboard/orders/'.(int) $r->order_id,
            ])
            ->all();

        return [
            'pack' => $this->fulfillmentBucketMulti($tid, $packStatuses, 'pack', '/dashboard/orders?status=processing', $locale),
            'ship' => $this->fulfillmentBucketMulti($tid, $shipStatuses, 'ship', '/dashboard/orders?status=webino-packaged', $locale),
            'tracking' => $this->fulfillmentBucketQuery($trackingQ, 'tracking', '/dashboard/orders?status=completed', $locale),
            'refund' => $this->fulfillmentBucketMulti($tid, ['cancelled', 'refunded', 'webino-returned'], 'refund', '/dashboard/orders?status=refunded', $locale, 14),
            'returns' => [
                'count' => $returnsCount,
                'items' => $returnItems,
                'href' => '/dashboard/orders',
            ],
        ];
    }

    /**
     * @param  list<string>  $statuses
     * @return array{count: int, items: list<array<string, mixed>>, href: string}
     */
    private function fulfillmentBucketMulti(int $tid, array $statuses, string $action, string $href, string $locale, ?int $withinDays = null): array
    {
        $q = Order::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', $statuses)
            ->with(['user:id,name,email']);
        if ($withinDays !== null) {
            $q->where('created_at', '>=', Carbon::now()->subDays($withinDays));
        }

        return $this->fulfillmentBucketQuery($q, $action, $href, $locale);
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<\App\Models\Order>  $q
     * @return array{count: int, items: list<array<string, mixed>>, href: string}
     */
    private function fulfillmentBucketQuery($q, string $action, string $href, string $locale): array
    {
        $count = (clone $q)->count();
        $items = $q->orderByDesc('id')->limit(8)->get()->map(function (Order $o) use ($action, $locale) {
            $meta = is_array($o->meta) ? $o->meta : [];

            return [
                'id' => $o->id,
                'number' => (string) ($o->number ?? $o->id),
                'customer_name' => (string) ($o->customer_name ?: $o->user?->name ?: $o->user?->email ?: '—'),
                'status' => (string) $o->status,
                'status_label' => OrderShippingStatuses::label((string) $o->status, $locale === 'en' ? 'en' : 'fa'),
                'href' => '/dashboard/orders/'.$o->id,
                'action' => $action,
                'shipping_kind' => (string) ($meta['shipping_kind'] ?? $meta['shipping_method'] ?? ''),
                'shipping_label' => (string) ($meta['shipping_label'] ?? ''),
                'purchase_type' => (string) ($meta['purchase_type'] ?? $meta['wfcp_purchase_type'] ?? ''),
                'payment_method_title' => (string) ($o->payment_provider ?? ''),
            ];
        })->all();

        return ['count' => $count, 'items' => $items, 'href' => $href];
    }

    /**
     * @return array{count: int, items: list<array<string, mixed>>, href: string}
     */
    private function fulfillmentBucket(int $tid, string $status, string $action, string $href, ?int $withinDays = null): array
    {
        return $this->fulfillmentBucketMulti($tid, [$status], $action, $href, 'fa', $withinDays);
    }

    /** @return array{items: list<array<string, mixed>>, counts: array{hold: int, approved: int, spam: int, trash: int}} */
    private function commentsSection(int $tid): array
    {
        $hold = ProductReview::query()->where('tenant_id', $tid)->where('status', 'pending')->count();
        $approved = ProductReview::query()->where('tenant_id', $tid)->where('status', 'approved')->count();
        $spam = ProductReview::query()->where('tenant_id', $tid)->where('status', 'spam')->count();
        $trash = ProductReview::query()->where('tenant_id', $tid)->where('status', 'trash')->count();
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
                'href' => '/dashboard/users/comments',
            ])
            ->all();

        return [
            'items' => $items,
            'counts' => [
                'hold' => $hold,
                'approved' => $approved,
                'spam' => $spam,
                'trash' => $trash,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function trafficSection(int $tid): array
    {
        $to = Carbon::now()->subDay()->format('Y-m-d');
        $from30 = Carbon::now()->subDays(30)->format('Y-m-d');
        $overview = $this->analytics->overview($tid, $from30, $to);
        $online = (int) ($overview['online'] ?? 0);
        $series = is_array($overview['series'] ?? null) ? $overview['series'] : [];

        $last7From = Carbon::now()->subDays(7)->format('Y-m-d');
        $last7To = $to;
        $last14From = Carbon::now()->subDays(14)->format('Y-m-d');
        $last14To = Carbon::now()->subDays(8)->format('Y-m-d');

        // Reuse overview series buckets instead of N extra overview() round-trips when possible.
        $last7 = $this->analytics->overview($tid, $last7From, $last7To);
        $last14 = $this->analytics->overview($tid, $last14From, $last14To);

        $visitorsChange = $this->changePct((int) ($last7['visitors'] ?? 0), (int) ($last14['visitors'] ?? 0));
        $viewsChange = $this->changePct((int) ($last7['views'] ?? 0), (int) ($last14['views'] ?? 0));

        $periods = [
            [
                'id' => 'last7_excl_today',
                'from' => $last7From,
                'to' => $last7To,
                'visitors' => (int) ($last7['visitors'] ?? 0),
                'views' => (int) ($last7['views'] ?? 0),
                'visitors_change_pct' => $visitorsChange,
                'views_change_pct' => $viewsChange,
            ],
            [
                'id' => 'last14_excl_today',
                'from' => $last14From,
                'to' => $last14To,
                'visitors' => (int) ($last14['visitors'] ?? 0),
                'views' => (int) ($last14['views'] ?? 0),
                'visitors_change_pct' => null,
                'views_change_pct' => null,
            ],
            [
                'id' => 'all_time',
                'from' => '',
                'to' => '',
                'visitors' => (int) ($overview['visitors'] ?? 0),
                'views' => (int) ($overview['views'] ?? 0),
                'visitors_change_pct' => null,
                'views_change_pct' => null,
            ],
        ];

        return [
            'active' => true,
            'source' => 'native',
            'online' => $online,
            'highlight' => [
                'visitors' => (int) ($last7['visitors'] ?? 0),
                'views' => (int) ($last7['views'] ?? 0),
                'visitors_change_pct' => $visitorsChange,
                'views_change_pct' => $viewsChange,
            ],
            'periods' => $periods,
            'all_time' => [
                'id' => 'all_time',
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
    private function alertsSection(array $panels, string $locale = 'fa'): array
    {
        $alerts = [];
        $sms = $panels['sms'] ?? null;
        if (is_array($sms) && ($sms['low_balance'] ?? false)) {
            $alerts[] = [
                'level' => 'warning',
                'source' => 'sms',
                'message' => __('dashboard.alert_sms_low', [], $locale === 'en' ? 'en' : 'fa'),
                'message_key' => 'dashboard.alert_sms_low',
                'at' => now()->toIso8601String(),
            ];
        }
        if (! ($panels['license']['active'] ?? false)) {
            $alerts[] = [
                'level' => 'error',
                'source' => 'license',
                'message' => __('dashboard.alert_license_inactive', [], $locale === 'en' ? 'en' : 'fa'),
                'message_key' => 'dashboard.alert_license_inactive',
                'at' => now()->toIso8601String(),
            ];
        }
        $bots = $panels['bots_summary'] ?? null;
        if (is_array($bots) && ($bots['errors_7d'] ?? 0) > 0) {
            $alerts[] = [
                'level' => 'warning',
                'source' => 'bots',
                'message' => __('dashboard.alert_bot_errors', [], $locale === 'en' ? 'en' : 'fa'),
                'message_key' => 'dashboard.alert_bot_errors',
                'at' => now()->toIso8601String(),
            ];
        }

        return $alerts;
    }

    /** @return array<string, mixed> */
    private function orderRow(Order $o, string $locale = 'fa'): array
    {
        return [
            'id' => $o->id,
            'number' => (string) ($o->number ?? $o->id),
            'status' => (string) $o->status,
            'status_label' => OrderShippingStatuses::label((string) $o->status, $locale === 'en' ? 'en' : 'fa'),
            'total' => (string) ((int) $o->total_minor),
            'date' => optional($o->created_at)?->toIso8601String() ?? '',
            'customer_name' => (string) ($o->customer_name ?: $o->user?->name ?: $o->user?->email ?: '—'),
            'item_count' => $o->relationLoaded('items') ? $o->items->sum('quantity') : 0,
        ];
    }

    /** @return array<string, mixed> */
    private function accountSection(User $user, int $tid): array
    {
        $ordersQ = Order::query()->where('tenant_id', $tid)->where('user_id', $user->id);
        $count = (clone $ordersQ)->count();
        $last = (clone $ordersQ)->orderByDesc('id')->first();
        $recent = (clone $ordersQ)->orderByDesc('id')->limit(5)->get()->map(fn (Order $o) => $this->orderRow($o))->all();

        $wallet = 0;
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('wallet_ledgers')) {
                $wallet = (int) DB::table('wallet_ledgers')
                    ->where('tenant_id', $tid)
                    ->where('user_id', $user->id)
                    ->sum('amount_minor');
            }
        } catch (\Throwable) {
            $wallet = 0;
        }

        $wishlist = 0;
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('wishlists')) {
                $wishlist = (int) DB::table('wishlists')->where('tenant_id', $tid)->where('user_id', $user->id)->count();
            }
        } catch (\Throwable) {
            $wishlist = 0;
        }

        $tickets = 0;
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('tickets')) {
                $tickets = (int) DB::table('tickets')->where('tenant_id', $tid)->where('user_id', $user->id)->count();
            }
        } catch (\Throwable) {
            $tickets = 0;
        }

        return [
            'orders_count' => $count,
            'last_order' => $last ? $this->orderRow($last) : null,
            'wallet_balance_minor' => $wallet,
            'wishlist_count' => $wishlist,
            'tickets_count' => $tickets,
            'recent_orders' => $recent,
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
