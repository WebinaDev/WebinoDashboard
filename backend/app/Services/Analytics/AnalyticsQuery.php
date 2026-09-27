<?php

namespace App\Services\Analytics;

use App\Models\BlogPost;
use App\Models\CmsPage;
use App\Models\Order;
use App\Models\Product;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class AnalyticsQuery
{
    public function __construct(private readonly AnalyticsRollup $rollup) {}

    /** @return array{from: string, to: string} */
    public function parseRange(?int $fromTs, ?int $toTs, int $days = 30): array
    {
        $tz = $this->rollup->timezone();
        $toTs = $toTs ?: time();
        $fromTs = $fromTs ?: ($toTs - max(1, min(365, $days)) * 86400);

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

    /** @return array<string, mixed> */
    public function overview(int $tenantId, string $from, string $to): array
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
            $views = (int) DB::table('analytics_events')->where('tenant_id', $tenantId)->whereBetween('created_at', [$start, $end])->count();
            $visitors = (int) DB::table('analytics_events')->where('tenant_id', $tenantId)->whereBetween('created_at', [$start, $end])->distinct('visitor_hash')->count('visitor_hash');
        }

        $seriesRows = DB::table('analytics_daily_totals')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->orderBy('day')
            ->get(['day', 'visitors', 'views']);
        $series = $this->fillDailySeries($from, $to, $seriesRows->keyBy(fn ($r) => (string) $r->day));

        return [
            'source' => 'native',
            'from' => $from,
            'to' => $to,
            'visitors' => $visitors,
            'views' => $views,
            'online' => $this->onlineCount($tenantId),
            'series' => $series,
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

        return array_merge($overview, $sessions, ['top_visitors' => $top]);
    }

    /** @return array<string, mixed> */
    public function pages(int $tenantId, string $from, string $to, int $page = 1, int $perPage = 20, string $search = ''): array
    {
        $q = DB::table('analytics_page_daily')
            ->where('tenant_id', $tenantId)
            ->whereBetween('day', [$from, $to])
            ->selectRaw('uri, post_id, SUM(views) as views')
            ->groupBy('uri', 'post_id')
            ->orderByDesc('views');
        if ($search !== '') {
            $q->where('uri', 'like', '%'.$search.'%');
        }
        $total = (clone $q)->get()->count();
        $items = $q->forPage($page, $perPage)->get()->map(fn ($r) => [
            'uri' => (string) $r->uri,
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
        $byCategory = [];
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

    public function onlineCount(int $tenantId): int
    {
        $timeout = max(1, (int) (AnalyticsSettings::get($tenantId)['online_timeout'] ?? 5));
        $since = Carbon::now('UTC')->subMinutes($timeout)->format('Y-m-d H:i:s');

        return (int) DB::table('analytics_visitors')
            ->where('tenant_id', $tenantId)
            ->where('last_seen', '>=', $since)
            ->count();
    }

    /** @return array<string, mixed> */
    public function online(int $tenantId): array
    {
        $timeout = max(1, (int) (AnalyticsSettings::get($tenantId)['online_timeout'] ?? 5));
        $since = Carbon::now('UTC')->subMinutes($timeout)->format('Y-m-d H:i:s');
        $visitors = DB::table('analytics_visitors')
            ->where('tenant_id', $tenantId)
            ->where('last_seen', '>=', $since)
            ->orderByDesc('last_seen')
            ->limit(50)
            ->get(['visitor_hash', 'country', 'last_seen', 'hits'])
            ->map(fn ($r) => [
                'visitor_hash' => substr((string) $r->visitor_hash, 0, 8),
                'country' => (string) $r->country,
                'last_seen' => (string) $r->last_seen,
                'hits' => (int) $r->hits,
            ])->all();

        return ['source' => 'native', 'count' => count($visitors), 'timeout' => $timeout, 'visitors' => $visitors];
    }

    /** @return array<string, mixed> */
    public function commerce(int $tenantId, string $from, string $to): array
    {
        $tz = $this->rollup->timezone();
        $start = Carbon::createFromFormat('Y-m-d', $from, $tz)->startOfDay();
        $end = Carbon::createFromFormat('Y-m-d', $to, $tz)->endOfDay();
        $paidStatuses = ['paid', 'processing', 'shipped', 'completed'];
        $orders = Order::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', $paidStatuses)
            ->whereBetween('created_at', [$start, $end]);
        $count = (clone $orders)->count();
        $revenue = (int) (clone $orders)->sum('total_minor');
        $currency = (string) (Order::query()->where('tenant_id', $tenantId)->value('currency') ?: 'IRR');

        return [
            'source' => 'native', 'from' => $from, 'to' => $to,
            'order_count' => $count, 'revenue' => $revenue, 'revenue_minor' => $revenue, 'currency' => $currency,
        ];
    }

    /** @return array<string, mixed> */
    public function compare(int $tenantId, string $from, string $to): array
    {
        $current = $this->overview($tenantId, $from, $to);
        $sessions = $this->sessionStats($tenantId, $from, $to);
        $days = max(1, (int) Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1);
        $prevTo = Carbon::parse($from)->subDay()->format('Y-m-d');
        $prevFrom = Carbon::parse($prevTo)->subDays($days - 1)->format('Y-m-d');
        $prev = $this->overview($tenantId, $prevFrom, $prevTo);
        $prevSessions = $this->sessionStats($tenantId, $prevFrom, $prevTo);

        return [
            'source' => 'native',
            'current' => array_merge($current, $sessions, ['from' => $from, 'to' => $to]),
            'previous' => array_merge($prev, $prevSessions, ['from' => $prevFrom, 'to' => $prevTo]),
            'change' => [
                'visitors' => $this->changePct($current['visitors'], $prev['visitors']),
                'views' => $this->changePct($current['views'], $prev['views']),
                'sessions' => $this->changePct($sessions['sessions'] ?? 0, $prevSessions['sessions'] ?? 0),
                'bounce_rate' => $this->changePct($sessions['bounce_rate'] ?? 0, $prevSessions['bounce_rate'] ?? 0),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function seo(int $tenantId, string $from, string $to): array
    {
        $publish = Product::query()->where('tenant_id', $tenantId)->where('status', 'publish')->count()
            + BlogPost::query()->where('tenant_id', $tenantId)->where('status', 'published')->count()
            + CmsPage::query()->where('tenant_id', $tenantId)->where('published', true)->count();

        return [
            'source' => 'native', 'from' => $from, 'to' => $to,
            'keywords_in_use' => 0, 'ai_keywords' => 0, 'optimized_pages' => 0,
            'publish_count' => $publish, 'noindex_count' => 0,
            'internal_links_avg' => 0, 'external_links_avg' => 0,
            'note' => 'rank_math_unavailable',
        ];
    }

    /** @return array<string, mixed> */
    public function support(int $tenantId, string $from, string $to): array
    {
        return [
            'source' => 'native', 'from' => $from, 'to' => $to,
            'tickets_created' => 0, 'staff_replies' => 0, 'csat_avg' => null, 'csat_count' => 0, 'frequent' => [],
        ];
    }

    /** @return array<string, mixed> */
    public function content(int $tenantId, string $from, string $to): array
    {
        $tz = $this->rollup->timezone();
        $start = Carbon::createFromFormat('Y-m-d', $from, $tz)->startOfDay();
        $end = Carbon::createFromFormat('Y-m-d', $to, $tz)->endOfDay();

        return [
            'source' => 'native', 'from' => $from, 'to' => $to,
            'products_created' => Product::query()->where('tenant_id', $tenantId)->whereBetween('created_at', [$start, $end])->count(),
            'products_updated' => Product::query()->where('tenant_id', $tenantId)->whereBetween('updated_at', [$start, $end])
                ->whereColumn('updated_at', '!=', 'created_at')->count(),
            'posts_published' => BlogPost::query()->where('tenant_id', $tenantId)->where('status', 'published')
                ->whereBetween('created_at', [$start, $end])->count(),
            'pages_published' => CmsPage::query()->where('tenant_id', $tenantId)->where('published', true)
                ->whereBetween('created_at', [$start, $end])->count(),
        ];
    }

    /** @return array<string, mixed> */
    public function monthSummary(int $tenantId, string $from, string $to): array
    {
        $overview = $this->overview($tenantId, $from, $to);
        $sessions = $this->sessionStats($tenantId, $from, $to);
        $commerce = $this->commerce($tenantId, $from, $to);
        $content = $this->content($tenantId, $from, $to);

        return [
            'source' => 'native', 'from' => $from, 'to' => $to,
            'traffic' => array_merge($overview, $sessions),
            'commerce' => $commerce,
            'content' => $content,
            'seo' => $this->seo($tenantId, $from, $to),
            'support' => $this->support($tenantId, $from, $to),
        ];
    }

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

    public function changePct(float|int $a, float|int $b): ?float
    {
        if ((float) $b == 0.0) {
            return (float) $a == 0.0 ? 0.0 : null;
        }

        return round((((float) $a - (float) $b) / (float) $b) * 100, 2);
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

    public function flushCache(int $tenantId): void
    {
        Cache::forget("analytics:summary:tenant:{$tenantId}");
    }
}
