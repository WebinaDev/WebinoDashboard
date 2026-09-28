<?php

namespace App\Services\Analytics;

use App\Models\BlogPost;
use App\Models\CmsPage;
use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Services\Reports\OrderReports;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

final class AnalyticsQuery
{
    public const CACHE_TTL = 90;

    public const ONLINE_CACHE_TTL = 15;

    /** Month-summary signal weights (WP parity). */
    public const SUMMARY_WEIGHTS = ['revenue' => 0.35, 'order_count' => 0.25, 'visitors' => 0.20, 'conversion' => 0.20];

    public function __construct(private readonly AnalyticsRollup $rollup) {}

    // ------------------------------------------------------------------
    // Ranges / caching
    // ------------------------------------------------------------------

    /** @return array{from: string, to: string} */
    public function parseRange(?int $fromTs, ?int $toTs, int $days = 30): array
    {
        $tz = $this->rollup->timezone();
        $toTs = $toTs ?: time();
        $fromTs = $fromTs ?: ($toTs - max(1, min(365, $days)) * 86400);
        if ($fromTs > $toTs) {
            [$fromTs, $toTs] = [$toTs, $fromTs];
        }

        return [
            'from' => Carbon::createFromTimestamp($fromTs, $tz)->format('Y-m-d'),
            'to' => Carbon::createFromTimestamp($toTs, $tz)->format('Y-m-d'),
        ];
    }

    /** @return array{from: string, to: string} */
    public function parseMonthOrRange(?int $fromTs, ?int $toTs): array
    {
        if ($fromTs || $toTs) {
            return $this->parseRange($fromTs, $toTs);
        }
        $tz = $this->rollup->timezone();
        $now = Carbon::now($tz);

        return ['from' => $now->copy()->startOfMonth()->format('Y-m-d'), 'to' => $now->format('Y-m-d')];
    }

    /** Equal-length window ending the day before $from. @return array{from: string, to: string} */
    public function previousWindow(string $from, string $to): array
    {
        $days = max(1, (int) Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1);
        $prevTo = Carbon::parse($from)->subDay();
        $prevFrom = $prevTo->copy()->subDays($days - 1);

        return ['from' => $prevFrom->format('Y-m-d'), 'to' => $prevTo->format('Y-m-d')];
    }

    public static function cacheVersion(int $tenantId): int
    {
        return (int) Cache::get("analytics:v:{$tenantId}", 1);
    }

    public static function bumpCacheVersion(int $tenantId): int
    {
        $next = self::cacheVersion($tenantId) + 1;
        Cache::forever("analytics:v:{$tenantId}", $next);

        return $next;
    }

    /** @param  array<string, mixed>  $params */
    public function cacheKey(int $tenantId, string $section, array $params): string
    {
        ksort($params);

        return 'analytics:'.$tenantId.':v'.self::cacheVersion($tenantId).':'.$section.':'.md5((string) json_encode($params));
    }

    /**
     * @param  array<string, mixed>  $params
     * @param  callable(): array<string, mixed>  $fn
     * @return array<string, mixed>
     */
    public function remember(int $tenantId, string $section, array $params, callable $fn): array
    {
        $ttl = $section === 'online' ? self::ONLINE_CACHE_TTL : self::CACHE_TTL;

        return Cache::remember($this->cacheKey($tenantId, $section, $params), $ttl, $fn);
    }

    public function flushCache(int $tenantId): void
    {
        self::bumpCacheVersion($tenantId);
        Cache::forget("analytics:summary:tenant:{$tenantId}");
        Cache::forget("analytics:online:{$tenantId}");
    }

    // ------------------------------------------------------------------
    // Traffic sections
    // ------------------------------------------------------------------

    /** @return array{visitors: int, views: int} */
    public function countRange(int $tenantId, string $from, string $to): array
    {
        $row = DB::table('analytics_daily_totals')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->selectRaw('COALESCE(SUM(visitors),0) as visitors, COALESCE(SUM(views),0) as views')
            ->first();
        $visitors = (int) ($row->visitors ?? 0);
        $views = (int) ($row->views ?? 0);

        if ($views === 0) {
            [$start, $end] = $this->rollup->gmtBounds($from, $to);
            $base = DB::table('analytics_events')
                ->where('tenant_id', $tenantId)
                ->where('event_type', 'pageview')
                ->whereBetween('created_at', [$start, $end]);
            $views = (int) (clone $base)->count();
            $visitors = (int) (clone $base)->distinct('visitor_hash')->count('visitor_hash');
        }

        return ['visitors' => $visitors, 'views' => $views];
    }

    /** @return array<string, mixed> */
    public function overview(int $tenantId, string $from, string $to): array
    {
        $counts = $this->countRange($tenantId, $from, $to);

        $seriesRows = DB::table('analytics_daily_totals')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->orderBy('day')
            ->get(['day', 'visitors', 'views']);
        $series = $this->fillDailySeries($from, $to, $seriesRows->keyBy(fn ($r) => substr((string) $r->day, 0, 10)));

        $orders = $this->saleOrders($tenantId, $from, $to);

        return [
            'source' => 'native',
            'from' => $from,
            'to' => $to,
            'visitors' => $counts['visitors'],
            'views' => $counts['views'],
            'online' => $this->onlineCount($tenantId),
            'series' => $series,
            'shop' => [
                'order_count' => (int) (clone $orders)->count(),
                'revenue_minor' => (int) (clone $orders)->sum('total_minor'),
                'currency' => $this->currency($tenantId),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function visitors(int $tenantId, string $from, string $to): array
    {
        $sessions = $this->sessionStats($tenantId, $from, $to);
        $top = DB::table('analytics_visitors')
            ->where('tenant_id', $tenantId)
            ->whereBetween('last_seen', $this->rollup->gmtBounds($from, $to))
            ->orderByDesc('hits')
            ->limit(20)
            ->get(['visitor_hash', 'hits', 'country', 'first_seen', 'last_seen'])
            ->map(fn ($r) => [
                'visitor_hash' => substr((string) $r->visitor_hash, 0, 8),
                'hits' => (int) $r->hits,
                'country' => (string) $r->country,
                'first_seen' => (string) $r->first_seen,
                'last_seen' => (string) $r->last_seen,
            ])
            ->all();
        $overview = $this->overview($tenantId, $from, $to);

        return array_merge($overview, $sessions, [
            'top_visitors' => $top,
            'online_list' => $this->onlineVisitors($tenantId),
        ]);
    }

    /** @return array<string, mixed> */
    public function pages(int $tenantId, string $from, string $to, int $page = 1, int $perPage = 20, string $search = ''): array
    {
        $q = DB::table('analytics_page_daily')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->selectRaw("uri, post_id, SUM(views) as views, MAX(COALESCE(title, '')) as title")
            ->groupBy('uri', 'post_id')
            ->orderByDesc('views');
        if ($search !== '') {
            $q->where(function ($w) use ($search) {
                $w->where('uri', 'like', '%'.$search.'%')->orWhere('title', 'like', '%'.$search.'%');
            });
        }
        $total = (int) DB::query()->fromSub((clone $q)->reorder(), 'p')->count();
        $rows = $q->forPage($page, $perPage)->get();

        $missing = $rows->filter(fn ($r) => trim((string) $r->title) === '')->pluck('uri')->unique()->values()->all();
        $latestTitles = [];
        if ($missing !== []) {
            DB::table('analytics_events')
                ->where('tenant_id', $tenantId)
                ->where('event_type', 'pageview')
                ->whereIn('uri', $missing)
                ->where('title', '!=', '')
                ->orderBy('id')
                ->get(['uri', 'title'])
                ->each(function ($r) use (&$latestTitles) {
                    $latestTitles[(string) $r->uri] = (string) $r->title;
                });
        }

        $items = $rows->map(fn ($r) => [
            'uri' => (string) $r->uri,
            'title' => trim((string) $r->title) !== '' ? (string) $r->title : ($latestTitles[(string) $r->uri] ?? ''),
            'post_id' => (int) $r->post_id,
            'views' => (int) $r->views,
        ])->all();

        return [
            'source' => 'native', 'from' => $from, 'to' => $to,
            'items' => $items, 'total' => $total, 'page' => $page, 'per_page' => $perPage,
        ];
    }

    /** @return array<string, mixed> */
    public function referrals(int $tenantId, string $from, string $to): array
    {
        $rows = DB::table('analytics_referrer_daily')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->selectRaw('ref_category, ref_source, SUM(visits) as visits')
            ->groupBy('ref_category', 'ref_source')
            ->orderByDesc('visits')
            ->limit(100)
            ->get();
        $byCategory = ['direct' => 0, 'search' => 0, 'social' => 0, 'referral' => 0];
        $items = [];
        foreach ($rows as $r) {
            $cat = (string) $r->ref_category;
            $byCategory[$cat] = ($byCategory[$cat] ?? 0) + (int) $r->visits;
            $items[] = ['category' => $cat, 'source' => (string) $r->ref_source, 'visits' => (int) $r->visits];
        }

        return [
            'source' => 'native', 'from' => $from, 'to' => $to,
            'by_category' => $byCategory, 'items' => $items,
        ];
    }

    /** @return array<string, mixed> */
    public function geo(int $tenantId, string $from, string $to, string $dim = 'country'): array
    {
        $dim = in_array($dim, ['country', 'city'], true) ? $dim : 'country';
        $items = DB::table('analytics_geo_daily')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->where('dim_type', $dim)
            ->selectRaw('dim_value as value, SUM(views) as views')
            ->groupBy('dim_value')
            ->orderByDesc('views')
            ->limit(100)
            ->get()
            ->map(fn ($r) => ['value' => (string) $r->value, 'views' => (int) $r->views])
            ->all();

        return ['source' => 'native', 'from' => $from, 'to' => $to, 'dim' => $dim, 'items' => $items];
    }

    /** @return array<string, mixed> */
    public function devices(int $tenantId, string $from, string $to, string $dim = 'browser'): array
    {
        $dim = in_array($dim, ['browser', 'os', 'device'], true) ? $dim : 'browser';
        $items = DB::table('analytics_device_daily')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->where('dim_type', $dim)
            ->selectRaw('dim_value as value, SUM(views) as views')
            ->groupBy('dim_value')
            ->orderByDesc('views')
            ->limit(50)
            ->get()
            ->map(fn ($r) => ['value' => (string) $r->value, 'views' => (int) $r->views])
            ->all();

        return ['source' => 'native', 'from' => $from, 'to' => $to, 'dim' => $dim, 'items' => $items];
    }

    private function onlineTimeout(int $tenantId): int
    {
        return max(1, (int) (AnalyticsSettings::get($tenantId)['online_timeout'] ?? 5));
    }

    public function onlineCount(int $tenantId): int
    {
        return (int) Cache::remember("analytics:online:{$tenantId}", self::ONLINE_CACHE_TTL, function () use ($tenantId) {
            $since = Carbon::now('UTC')->subMinutes($this->onlineTimeout($tenantId))->format('Y-m-d H:i:s');

            return (int) DB::table('analytics_visitors')
                ->where('tenant_id', $tenantId)
                ->where('last_seen', '>=', $since)
                ->count();
        });
    }

    /** @return list<array{visitor_hash: string, country: string, last_seen: string, hits: int}> */
    private function onlineVisitors(int $tenantId, int $limit = 50): array
    {
        $since = Carbon::now('UTC')->subMinutes($this->onlineTimeout($tenantId))->format('Y-m-d H:i:s');

        return DB::table('analytics_visitors')
            ->where('tenant_id', $tenantId)
            ->where('last_seen', '>=', $since)
            ->orderByDesc('last_seen')
            ->limit($limit)
            ->get(['visitor_hash', 'country', 'last_seen', 'hits'])
            ->map(fn ($r) => [
                'visitor_hash' => substr((string) $r->visitor_hash, 0, 8),
                'country' => (string) $r->country,
                'last_seen' => (string) $r->last_seen,
                'hits' => (int) $r->hits,
            ])->values()->all();
    }

    /** @return array<string, mixed> */
    public function online(int $tenantId): array
    {
        return [
            'source' => 'native',
            'count' => $this->onlineCount($tenantId),
            'timeout' => $this->onlineTimeout($tenantId),
            'visitors' => $this->onlineVisitors($tenantId),
        ];
    }

    // ------------------------------------------------------------------
    // Commerce
    // ------------------------------------------------------------------

    /** @return EloquentBuilder<Order> */
    private function saleOrders(int $tenantId, string $from, string $to): EloquentBuilder
    {
        return Order::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', OrderReports::salesStatuses())
            ->whereBetween('created_at', $this->rollup->gmtBounds($from, $to));
    }

    private function currency(int $tenantId): string
    {
        $tenantCurrency = (string) (Tenant::query()->whereKey($tenantId)->value('default_currency') ?? '');
        if ($tenantCurrency !== '') {
            return $tenantCurrency;
        }

        return (string) (Order::query()->where('tenant_id', $tenantId)->value('currency') ?: 'IRR');
    }

    /** @return array{order_count: int, revenue_minor: int, aov_minor: int, new_customers: int, returning_customers: int, visitors: int, conversion_pct: float|null} */
    private function commerceCore(int $tenantId, string $from, string $to): array
    {
        $orders = $this->saleOrders($tenantId, $from, $to);
        $count = (int) (clone $orders)->count();
        $revenue = (int) (clone $orders)->sum('total_minor');
        $visitors = $this->countRange($tenantId, $from, $to)['visitors'];
        [$new, $returning] = $this->customerSplit($tenantId, $from, $to);

        return [
            'order_count' => $count,
            'revenue_minor' => $revenue,
            'aov_minor' => $count > 0 ? (int) round($revenue / $count) : 0,
            'new_customers' => $new,
            'returning_customers' => $returning,
            'visitors' => $visitors,
            'conversion_pct' => $visitors > 0 ? round($count / $visitors * 100, 2) : null,
        ];
    }

    /**
     * Distinct customers in the window: new = no sale order before the window.
     *
     * @return array{0: int, 1: int}
     */
    private function customerSplit(int $tenantId, string $from, string $to): array
    {
        $rows = $this->saleOrders($tenantId, $from, $to)->get(['user_id', 'customer_email', 'customer_phone']);
        $userIds = [];
        $guestEmails = [];
        $guestPhones = [];
        foreach ($rows as $o) {
            if ($o->user_id) {
                $userIds[(int) $o->user_id] = true;
            } elseif (trim((string) $o->customer_email) !== '') {
                $guestEmails[strtolower(trim((string) $o->customer_email))] = true;
            } elseif (trim((string) $o->customer_phone) !== '') {
                $guestPhones[trim((string) $o->customer_phone)] = true;
            }
        }
        $total = count($userIds) + count($guestEmails) + count($guestPhones);
        if ($total === 0) {
            return [0, 0];
        }

        [$start] = $this->rollup->gmtBounds($from, $to);
        $prior = fn () => Order::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', OrderReports::salesStatuses())
            ->where('created_at', '<', $start);
        $returning = 0;
        foreach (array_chunk(array_keys($userIds), 500) as $chunk) {
            $returning += (int) $prior()->whereIn('user_id', $chunk)->distinct('user_id')->count('user_id');
        }
        foreach (array_chunk(array_keys($guestEmails), 500) as $chunk) {
            $returning += (int) $prior()->whereNull('user_id')->whereIn(DB::raw('LOWER(customer_email)'), $chunk)
                ->distinct()->count(DB::raw('LOWER(customer_email)'));
        }
        foreach (array_chunk(array_keys($guestPhones), 500) as $chunk) {
            $returning += (int) $prior()->whereNull('user_id')->whereIn('customer_phone', $chunk)
                ->distinct('customer_phone')->count('customer_phone');
        }
        $returning = min($returning, $total);

        return [$total - $returning, $returning];
    }

    public static function channelFor(string $utmSource): string
    {
        $key = strtolower(trim($utmSource));
        if (in_array($key, ['instagram', 'ig', 'ig.me'], true)) {
            return 'instagram';
        }
        if (in_array($key, ['(direct/none)', 'direct', 'none', 'organic', 'google', 'bing', 'yahoo', ''], true)
            || str_contains($key, 'google')) {
            return 'site';
        }

        return 'other';
    }

    /** @return array<string, mixed> */
    public function commerce(int $tenantId, string $from, string $to): array
    {
        $cur = $this->commerceCore($tenantId, $from, $to);
        $prevRange = $this->previousWindow($from, $to);
        $prev = $this->commerceCore($tenantId, $prevRange['from'], $prevRange['to']);

        $utmRows = $this->saleOrders($tenantId, $from, $to)
            ->selectRaw("COALESCE(utm_source, '') as src, COUNT(*) as orders, COALESCE(SUM(total_minor),0) as revenue")
            ->groupBy(DB::raw("COALESCE(utm_source, '')"))
            ->orderByDesc('revenue')
            ->toBase()
            ->get();
        $channels = ['site' => 0, 'instagram' => 0, 'other' => 0];
        $byUtm = [];
        foreach ($utmRows as $r) {
            $src = trim((string) $r->src);
            $channels[self::channelFor($src)] += (int) $r->revenue;
            $label = $src === '' ? '(direct/none)' : $src;
            if (isset($byUtm[$label])) {
                $byUtm[$label]['orders'] += (int) $r->orders;
                $byUtm[$label]['revenue_minor'] += (int) $r->revenue;
            } else {
                $byUtm[$label] = ['source' => $label, 'orders' => (int) $r->orders, 'revenue_minor' => (int) $r->revenue];
            }
        }
        $byUtm = array_values($byUtm);
        usort($byUtm, fn ($a, $b) => $b['revenue_minor'] <=> $a['revenue_minor']);

        [$start, $end] = $this->rollup->gmtBounds($from, $to);

        return [
            'source' => 'native',
            'from_day' => $from,
            'to_day' => $to,
            'order_count' => $cur['order_count'],
            'revenue_minor' => $cur['revenue_minor'],
            'currency' => $this->currency($tenantId),
            'aov_minor' => $cur['aov_minor'],
            'conversion_pct' => $cur['conversion_pct'],
            'channels' => $channels,
            'new_customers' => $cur['new_customers'],
            'returning_customers' => $cur['returning_customers'],
            'change' => [
                'order_count_pct' => self::changePct($cur['order_count'], $prev['order_count']),
                'revenue_pct' => self::changePct($cur['revenue_minor'], $prev['revenue_minor']),
                'aov_pct' => self::changePct($cur['aov_minor'], $prev['aov_minor']),
                'new_customers_pct' => self::changePct($cur['new_customers'], $prev['new_customers']),
                'returning_customers_pct' => self::changePct($cur['returning_customers'], $prev['returning_customers']),
            ],
            'by_utm_source' => array_slice($byUtm, 0, 12),
            'top_viewed_products' => $this->topProductEvents($tenantId, 'product_view', $start, $end, 'views'),
            'top_cart_products' => $this->topProductEvents($tenantId, 'add_to_cart', $start, $end, 'adds'),
            'top_purchased_products' => $this->topPurchased($tenantId, $start, $end),
            'funnel' => [
                ['step' => 'visitors', 'count' => $cur['visitors']],
                ['step' => 'product_views', 'count' => $this->distinctEventVisitors($tenantId, 'product_view', $start, $end)],
                ['step' => 'add_to_cart', 'count' => $this->distinctEventVisitors($tenantId, 'add_to_cart', $start, $end)],
                ['step' => 'checkout', 'count' => $this->distinctEventVisitors($tenantId, 'checkout_start', $start, $end)],
                ['step' => 'orders', 'count' => $cur['order_count']],
            ],
        ];
    }

    private function distinctEventVisitors(int $tenantId, string $type, string $start, string $end): int
    {
        return (int) DB::table('analytics_events')
            ->where('tenant_id', $tenantId)
            ->where('event_type', $type)
            ->whereBetween('created_at', [$start, $end])
            ->distinct('visitor_hash')
            ->count('visitor_hash');
    }

    /** @return list<array<string, int|string>> */
    private function topProductEvents(int $tenantId, string $type, string $start, string $end, string $countKey): array
    {
        $rows = DB::table('analytics_events as e')
            ->leftJoin('products as p', function ($j) use ($tenantId) {
                $j->on('p.id', '=', 'e.post_id')->where('p.tenant_id', '=', $tenantId);
            })
            ->where('e.tenant_id', $tenantId)
            ->where('e.event_type', $type)
            ->where('e.post_id', '>', 0)
            ->whereBetween('e.created_at', [$start, $end])
            ->selectRaw('e.post_id as product_id, MAX(p.name) as name, COUNT(*) as cnt')
            ->groupBy('e.post_id')
            ->orderByDesc('cnt')
            ->limit(10)
            ->get();

        return $rows->map(fn ($r) => [
            'product_id' => (int) $r->product_id,
            'name' => (string) ($r->name ?? ''),
            $countKey => (int) $r->cnt,
        ])->values()->all();
    }

    /** @return list<array{product_id: int, name: string, quantity: int, revenue_minor: int}> */
    private function topPurchased(int $tenantId, string $start, string $end): array
    {
        return DB::table('order_items as i')
            ->join('orders as o', 'o.id', '=', 'i.order_id')
            ->where('o.tenant_id', $tenantId)
            ->whereIn('o.status', OrderReports::salesStatuses())
            ->whereBetween('o.created_at', [$start, $end])
            ->whereNotNull('i.product_id')
            ->selectRaw('i.product_id, MAX(i.product_name) as name, SUM(i.quantity) as quantity, SUM(i.quantity * i.unit_price_minor) as revenue')
            ->groupBy('i.product_id')
            ->orderByDesc('quantity')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'product_id' => (int) $r->product_id,
                'name' => (string) ($r->name ?? ''),
                'quantity' => (int) $r->quantity,
                'revenue_minor' => (int) $r->revenue,
            ])->values()->all();
    }

    // ------------------------------------------------------------------
    // Compare / month summary
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    public function compare(int $tenantId, string $from, string $to): array
    {
        $prevRange = $this->previousWindow($from, $to);
        $curCounts = $this->countRange($tenantId, $from, $to);
        $prevCounts = $this->countRange($tenantId, $prevRange['from'], $prevRange['to']);
        $curSess = $this->sessionStats($tenantId, $from, $to);
        $prevSess = $this->sessionStats($tenantId, $prevRange['from'], $prevRange['to']);
        $sessionsAvailable = $curSess['sessions'] > 0;

        $topSources = DB::table('analytics_referrer_daily')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->where('ref_source', '!=', '')
            ->selectRaw('ref_source, SUM(visits) as visits')
            ->groupBy('ref_source')
            ->orderByDesc('visits')
            ->limit(3)
            ->pluck('ref_source')
            ->map(fn ($s) => (string) $s)
            ->all();
        $topPages = array_map(
            fn ($p) => $p['title'] !== '' ? $p['title'] : $p['uri'],
            $this->pages($tenantId, $from, $to, 1, 3)['items']
        );

        $curConv = $this->conversionPct($tenantId, $from, $to, $curCounts['visitors']);
        $prevConv = $this->conversionPct($tenantId, $prevRange['from'], $prevRange['to'], $prevCounts['visitors']);

        $bounce = fn (array $s) => $s['sessions'] > 0 ? round($s['bounces'] / $s['sessions'] * 100, 1) : null;
        $duration = fn (array $s) => $s['sessions'] > 0 ? $s['avg_duration_ms'] : null;

        $row = function (string $key, int|float|null $cur, int|float|null $prev, bool $pending = false): array {
            if ($pending) {
                return ['key' => $key, 'current' => null, 'previous' => null, 'change_pct' => null];
            }

            return [
                'key' => $key,
                'current' => $cur,
                'previous' => $prev,
                'change_pct' => $cur === null || $prev === null ? null : self::changePct($cur, $prev),
            ];
        };

        return [
            'source' => 'native',
            'current' => ['from_day' => $from, 'to_day' => $to],
            'previous' => ['from_day' => $prevRange['from'], 'to_day' => $prevRange['to']],
            'sessions_available' => $sessionsAvailable,
            'rows' => [
                $row('visitors', $curCounts['visitors'], $prevCounts['visitors']),
                $row('views', $curCounts['views'], $prevCounts['views']),
                $row('avg_duration_ms', $duration($curSess), $duration($prevSess), ! $sessionsAvailable),
                $row('bounce_rate_pct', $bounce($curSess), $bounce($prevSess), ! $sessionsAvailable),
                ['key' => 'top_sources', 'current' => implode(' · ', array_filter($topSources)), 'previous' => null, 'change_pct' => null],
                ['key' => 'top_pages', 'current' => implode(' · ', array_filter($topPages)), 'previous' => null, 'change_pct' => null],
                $row('site_conversion_pct', $curConv, $prevConv),
            ],
        ];
    }

    private function conversionPct(int $tenantId, string $from, string $to, int $visitors): ?float
    {
        if ($visitors <= 0) {
            return null;
        }
        $orders = (int) $this->saleOrders($tenantId, $from, $to)->count();

        return round($orders / $visitors * 100, 2);
    }

    /** @return array<string, mixed> */
    public function monthSummary(int $tenantId, string $from, string $to): array
    {
        $prevRange = $this->previousWindow($from, $to);
        $curCounts = $this->countRange($tenantId, $from, $to);
        $prevCounts = $this->countRange($tenantId, $prevRange['from'], $prevRange['to']);
        $curOrders = $this->saleOrders($tenantId, $from, $to);
        $prevOrders = $this->saleOrders($tenantId, $prevRange['from'], $prevRange['to']);
        $cur = ['order_count' => (int) (clone $curOrders)->count(), 'revenue' => (int) (clone $curOrders)->sum('total_minor')];
        $prev = ['order_count' => (int) (clone $prevOrders)->count(), 'revenue' => (int) (clone $prevOrders)->sum('total_minor')];
        $curConv = $curCounts['visitors'] > 0 ? round($cur['order_count'] / $curCounts['visitors'] * 100, 2) : null;
        $prevConv = $prevCounts['visitors'] > 0 ? round($prev['order_count'] / $prevCounts['visitors'] * 100, 2) : null;

        $changes = [
            'revenue' => self::changePct($cur['revenue'], $prev['revenue']),
            'order_count' => self::changePct($cur['order_count'], $prev['order_count']),
            'visitors' => self::changePct($curCounts['visitors'], $prevCounts['visitors']),
            'conversion' => self::changePct((float) ($curConv ?? 0), (float) ($prevConv ?? 0)),
        ];
        $scored = self::scoreSignals($changes);
        $sessions = $this->sessionStats($tenantId, $from, $to);

        return array_merge([
            'source' => 'native',
            'from_day' => $from,
            'to_day' => $to,
        ], $scored, [
            'traffic' => [
                'visitors' => $curCounts['visitors'],
                'views' => $curCounts['views'],
                'sessions' => $sessions['sessions'],
            ],
            'commerce' => [
                'order_count' => $cur['order_count'],
                'revenue_minor' => $cur['revenue'],
                'currency' => $this->currency($tenantId),
            ],
        ]);
    }

    /**
     * WP month-summary scoring: weighted average of clamped (±100) changes.
     *
     * @param  array<string, float|null>  $changes  keyed by revenue|order_count|visitors|conversion
     * @return array{status: string, score: float, composite: float, top_achievement: array{key: string, change_pct: float}|null, top_challenge: array{key: string, change_pct: float}|null, deltas: list<array{key: string, change_pct: float|null, weight: float}>}
     */
    public static function scoreSignals(array $changes): array
    {
        $composite = 0.0;
        $weightSum = 0.0;
        $best = null;
        $worst = null;
        $deltas = [];
        foreach (self::SUMMARY_WEIGHTS as $key => $weight) {
            $pct = $changes[$key] ?? null;
            $deltas[] = ['key' => $key, 'change_pct' => $pct, 'weight' => $weight];
            if ($pct === null) {
                continue;
            }
            $composite += max(-100.0, min(100.0, (float) $pct)) * $weight;
            $weightSum += $weight;
            if ($best === null || $pct > $best['change_pct']) {
                $best = ['key' => $key, 'change_pct' => (float) $pct];
            }
            if ($worst === null || $pct < $worst['change_pct']) {
                $worst = ['key' => $key, 'change_pct' => (float) $pct];
            }
        }
        if ($weightSum > 0 && abs($weightSum - 1.0) > 0.001) {
            $composite /= $weightSum;
        }
        $status = $composite >= 5.0 ? 'growth' : ($composite <= -5.0 ? 'decline' : 'stable');
        $score = round(((max(-50.0, min(50.0, $composite)) + 50.0) / 100.0) * 10.0, 1);

        return [
            'status' => $status,
            'score' => $score,
            'composite' => round($composite, 2),
            'top_achievement' => $best !== null && $best['change_pct'] > 0 ? $best : null,
            'top_challenge' => $worst !== null && $worst['change_pct'] < 0 ? $worst : null,
            'deltas' => $deltas,
        ];
    }

    // ------------------------------------------------------------------
    // SEO / support / content
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    public function seo(int $tenantId, string $from, string $to): array
    {
        $docs = [];
        Product::query()->where('tenant_id', $tenantId)->where('status', 'publish')
            ->orderByDesc('updated_at')->limit(5000)
            ->get(['id', 'name', 'description', 'meta', 'updated_at'])
            ->each(function (Product $p) use (&$docs) {
                $meta = is_array($p->meta) ? $p->meta : [];
                $docs[] = [
                    'keyword' => (string) ($meta['seo_keyword'] ?? $meta['focus_keyword'] ?? ''),
                    'title' => (string) ($meta['seo_title'] ?? ''),
                    'description' => (string) ($meta['seo_description'] ?? ''),
                    'robots' => (string) ($meta['seo_robots'] ?? ''),
                    'noindex' => ! empty($meta['seo_noindex']),
                    'body' => (string) ($p->description ?? ''),
                    'updated' => (string) $p->updated_at,
                ];
            });
        BlogPost::query()->where('tenant_id', $tenantId)->where('status', 'published')
            ->orderByDesc('updated_at')->limit(5000)
            ->get(['id', 'title', 'body', 'seo', 'updated_at'])
            ->each(function (BlogPost $p) use (&$docs) {
                $docs[] = $this->seoDoc(is_array($p->seo) ? $p->seo : [], (string) ($p->body ?? ''), (string) $p->updated_at);
            });
        CmsPage::query()->where('tenant_id', $tenantId)
            ->where(fn ($q) => $q->where('published', true)->orWhereIn('status', ['publish', 'published']))
            ->orderByDesc('updated_at')->limit(5000)
            ->get(['id', 'title', 'body', 'seo', 'updated_at'])
            ->each(function (CmsPage $p) use (&$docs) {
                $body = $p->body;
                $docs[] = $this->seoDoc(is_array($p->seo) ? $p->seo : [], is_string($body) ? $body : (string) json_encode($body), (string) $p->updated_at);
            });

        $keywords = [];
        $optimized = 0;
        $noindex = 0;
        foreach ($docs as $d) {
            $kw = mb_strtolower(trim($d['keyword']));
            if ($kw !== '') {
                $keywords[$kw] = true;
                $inTitle = $d['title'] !== '' && str_contains(mb_strtolower($d['title']), $kw);
                $inDesc = $d['description'] !== '' && str_contains(mb_strtolower($d['description']), $kw);
                if ($inTitle || $inDesc) {
                    $optimized++;
                }
            }
            if ($d['noindex'] || str_contains(strtolower($d['robots']), 'noindex')) {
                $noindex++;
            }
        }
        $publish = count($docs);

        usort($docs, fn ($a, $b) => strcmp($b['updated'], $a['updated']));
        $links = $this->sampleLinks(array_slice(array_filter($docs, fn ($d) => trim($d['body']) !== ''), 0, 80));

        $aiKeywords = 0;
        if (Schema::hasTable('ai_runs')) {
            $aiKeywords = (int) DB::table('ai_runs')
                ->where('tenant_id', $tenantId)
                ->where('focus_keyword', '!=', '')
                ->whereBetween('created_at', $this->rollup->gmtBounds($from, $to))
                ->distinct('focus_keyword')
                ->count('focus_keyword');
        }

        return [
            'source' => 'native',
            'from_day' => $from,
            'to_day' => $to,
            'keywords_in_use' => count($keywords),
            'optimized_pages' => $optimized,
            'internal_links_avg' => $links['sampled'] > 0 ? round($links['internal'] / $links['sampled'], 1) : 0,
            'external_links_avg' => $links['sampled'] > 0 ? round($links['external'] / $links['sampled'], 1) : 0,
            'noindex_pct' => $publish > 0 ? round($noindex / $publish * 100, 1) : 0,
            'keywords_ai_month' => $aiKeywords,
            'publish_count' => $publish,
            'noindex_count' => $noindex,
            'links_sampled' => $links['sampled'],
            'gsc_connected' => false,
        ];
    }

    /**
     * @param  array<string, mixed>  $seo
     * @return array{keyword: string, title: string, description: string, robots: string, noindex: bool, body: string, updated: string}
     */
    private function seoDoc(array $seo, string $body, string $updated): array
    {
        $robots = $seo['robots'] ?? '';

        return [
            'keyword' => (string) ($seo['focus_keyword'] ?? $seo['keyword'] ?? ''),
            'title' => (string) ($seo['title'] ?? $seo['seo_title'] ?? ''),
            'description' => (string) ($seo['description'] ?? $seo['seo_description'] ?? ''),
            'robots' => is_array($robots) ? implode(',', $robots) : (string) $robots,
            'noindex' => ! empty($seo['noindex']),
            'body' => $body,
            'updated' => $updated,
        ];
    }

    /**
     * @param  array<int, array{body: string}>  $docs
     * @return array{internal: int, external: int, sampled: int}
     */
    private function sampleLinks(array $docs): array
    {
        $host = strtolower((string) (parse_url((string) config('app.url'), PHP_URL_HOST) ?? ''));
        $internal = 0;
        $external = 0;
        $sampled = 0;
        foreach ($docs as $d) {
            $sampled++;
            if (! preg_match_all('/<a\s[^>]*href=["\']([^"\']+)["\']/i', $d['body'], $m)) {
                continue;
            }
            foreach ($m[1] as $href) {
                $href = trim((string) $href);
                if ($href === '' || str_starts_with($href, '#') || str_starts_with($href, 'mailto:') || str_starts_with($href, 'tel:')) {
                    continue;
                }
                if (str_starts_with($href, '/') && ! str_starts_with($href, '//')) {
                    $internal++;

                    continue;
                }
                $h = strtolower((string) (parse_url($href, PHP_URL_HOST) ?? ''));
                if ($h === '' || ($host !== '' && ($h === $host || str_contains($h, $host)))) {
                    $internal++;
                } else {
                    $external++;
                }
            }
        }

        return ['internal' => $internal, 'external' => $external, 'sampled' => $sampled];
    }

    /** @return array<string, mixed> */
    public function support(int $tenantId, string $from, string $to): array
    {
        $bounds = $this->rollup->gmtBounds($from, $to);
        $out = [
            'source' => 'native', 'from_day' => $from, 'to_day' => $to,
            'tickets_created' => 0, 'staff_replies' => 0, 'csat_avg' => null, 'csat_count' => 0, 'frequent' => [],
        ];
        if (! Schema::hasTable('support_tickets')) {
            return $out;
        }

        $out['tickets_created'] = (int) DB::table('support_tickets')
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', $bounds)
            ->count();
        if (Schema::hasTable('support_ticket_replies')) {
            $out['staff_replies'] = (int) DB::table('support_ticket_replies')
                ->where('tenant_id', $tenantId)
                ->where('is_staff', true)
                ->whereBetween('created_at', $bounds)
                ->count();
        }
        $csat = DB::table('support_tickets')
            ->where('tenant_id', $tenantId)
            ->whereNotNull('csat_rating')
            ->where('csat_rating', '>', 0)
            ->whereBetween(DB::raw('COALESCE(csat_at, updated_at)'), $bounds)
            ->selectRaw('AVG(csat_rating) as avg_r, COUNT(*) as cnt')
            ->first();
        $out['csat_count'] = (int) ($csat->cnt ?? 0);
        $out['csat_avg'] = $out['csat_count'] > 0 ? round((float) $csat->avg_r, 2) : null;
        $out['frequent'] = DB::table('support_tickets')
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', $bounds)
            ->selectRaw('subject, COUNT(*) as cnt')
            ->groupBy('subject')
            ->orderByDesc('cnt')
            ->limit(10)
            ->get()
            ->map(fn ($r) => ['subject' => (string) $r->subject, 'count' => (int) $r->cnt])
            ->values()
            ->all();

        return $out;
    }

    /** @return array<string, mixed> */
    public function content(int $tenantId, string $from, string $to): array
    {
        $bounds = $this->rollup->gmtBounds($from, $to);
        $aiCount = function (array $types) use ($tenantId, $bounds): int {
            if (! Schema::hasTable('ai_runs')) {
                return 0;
            }

            return (int) DB::table('ai_runs')
                ->where('tenant_id', $tenantId)
                ->whereIn('target_type', $types)
                ->whereBetween('created_at', $bounds)
                ->count();
        };

        return [
            'source' => 'native',
            'from_day' => $from,
            'to_day' => $to,
            'products_created' => Product::query()->where('tenant_id', $tenantId)->whereBetween('created_at', $bounds)->count(),
            'products_updated' => Product::query()->where('tenant_id', $tenantId)->whereBetween('updated_at', $bounds)
                ->whereColumn('updated_at', '!=', 'created_at')->count(),
            'posts_published' => BlogPost::query()->where('tenant_id', $tenantId)->where('status', 'published')
                ->whereBetween(DB::raw('COALESCE(published_at, created_at)'), $bounds)->count(),
            'pages_published' => CmsPage::query()->where('tenant_id', $tenantId)
                ->where(fn ($q) => $q->where('published', true)->orWhereIn('status', ['publish', 'published']))
                ->whereBetween('created_at', $bounds)->count(),
            'ai_products' => $aiCount(['product']),
            'ai_posts' => $aiCount(['post']),
            'ai_pages' => $aiCount(['page']),
        ];
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** @return array{sessions: int, bounces: int, bounce_rate: float, avg_duration_ms: int} */
    public function sessionStats(int $tenantId, string $from, string $to): array
    {
        $row = DB::table('analytics_daily_totals')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->selectRaw('COALESCE(SUM(sessions),0) as sessions, COALESCE(SUM(bounces),0) as bounces, COALESCE(SUM(duration_sum_ms),0) as duration_sum_ms')
            ->first();
        $sessions = (int) ($row->sessions ?? 0);
        $bounces = (int) ($row->bounces ?? 0);
        $duration = (int) ($row->duration_sum_ms ?? 0);

        return [
            'sessions' => $sessions,
            'bounces' => $bounces,
            'bounce_rate' => $sessions > 0 ? round($bounces / $sessions * 100, 2) : 0.0,
            'avg_duration_ms' => $sessions > 0 ? (int) round($duration / $sessions) : 0,
        ];
    }

    /** WP parity: (a-b)/b*100 at 1dp; b=0 => 100 when a>0, else null. */
    public static function changePct(float|int $a, float|int $b): ?float
    {
        $a = (float) $a;
        $b = (float) $b;
        if ($b == 0.0) {
            return $a > 0 ? 100.0 : null;
        }

        return round((($a - $b) / $b) * 100, 1);
    }

    /** @param  \Illuminate\Support\Collection<string, object>  $keyed */
    private function fillDailySeries(string $from, string $to, $keyed): array
    {
        $out = [];
        $cur = Carbon::parse($from);
        $end = Carbon::parse($to);
        while ($cur->lte($end)) {
            $day = $cur->format('Y-m-d');
            $row = $keyed->get($day);
            $out[] = [
                'day' => $day,
                'visitors' => (int) ($row->visitors ?? 0),
                'views' => (int) ($row->views ?? 0),
            ];
            $cur->addDay();
        }

        return $out;
    }
}
