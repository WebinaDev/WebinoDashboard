<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Analytics\AnalyticsQuery;
use App\Services\Analytics\AnalyticsRollup;
use App\Services\Analytics\AnalyticsSettings;
use Illuminate\Http\Request;

class AnalyticsController extends Controller
{
    /** Sections whose default range (no from/to) is the current calendar month. */
    private const MONTH_DEFAULT_SECTIONS = ['commerce', 'compare', 'seo', 'support', 'content', 'month-summary'];

    public function __construct(
        private readonly AnalyticsQuery $query,
        private readonly AnalyticsRollup $rollup,
    ) {}

    public function summary(Request $request): \Illuminate\Http\JsonResponse
    {
        // Keep home-dashboard KPIs (existing contract).
        $tid = (int) $request->user()->tenant_id;
        $cacheKey = "analytics:summary:tenant:{$tid}";
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 30, function () use ($tid) {
            return [
                'orders_open' => \App\Models\Order::query()
                    ->where('tenant_id', $tid)
                    ->whereIn('status', ['pending_payment', 'processing'])
                    ->count(),
                'orders_paid' => \App\Models\Order::query()
                    ->where('tenant_id', $tid)
                    ->where('status', 'paid')
                    ->count(),
                'products' => \App\Models\Product::query()->where('tenant_id', $tid)->count(),
                'revenue_minor' => \App\Models\Order::query()
                    ->where('tenant_id', $tid)
                    ->where('status', 'paid')
                    ->sum('total_minor'),
                'online' => $this->query->onlineCount($tid),
            ];
        });

        return response()->json(['data' => $data])->header('Cache-Control', 'private, max-age=30');
    }

    public function section(Request $request, string $section): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $fromTs = $request->filled('from') ? (int) $request->query('from') : null;
        $toTs = $request->filled('to') ? (int) $request->query('to') : null;
        $days = max(1, min(365, (int) $request->query('days', 30)));
        $range = in_array($section, self::MONTH_DEFAULT_SECTIONS, true)
            ? $this->query->parseMonthOrRange($fromTs, $toTs)
            : $this->query->parseRange($fromTs, $toTs, $days);
        $from = $range['from'];
        $to = $range['to'];

        $page = max(1, (int) $request->query('page', 1));
        $perPage = max(1, min(100, (int) $request->query('per_page', 20)));
        $search = trim((string) $request->query('search', ''));
        $dim = (string) $request->query('dim', '');

        $resolver = match ($section) {
            'overview' => fn () => $this->query->overview($tid, $from, $to),
            'visitors' => fn () => $this->query->visitors($tid, $from, $to),
            'pages' => fn () => $this->query->pages($tid, $from, $to, $page, $perPage, $search),
            'referrals' => fn () => $this->query->referrals($tid, $from, $to),
            'geo' => fn () => $this->query->geo($tid, $from, $to, $dim !== '' ? $dim : 'country'),
            'devices' => fn () => $this->query->devices($tid, $from, $to, $dim !== '' ? $dim : 'browser'),
            'online' => fn () => $this->query->online($tid),
            'commerce' => fn () => $this->query->commerce($tid, $from, $to),
            'compare' => fn () => $this->query->compare($tid, $from, $to),
            'seo' => fn () => $this->query->seo($tid, $from, $to),
            'support' => fn () => $this->query->support($tid, $from, $to),
            'content' => fn () => $this->query->content($tid, $from, $to),
            'month-summary' => fn () => $this->query->monthSummary($tid, $from, $to),
            default => null,
        };
        if ($resolver === null) {
            return response()->json(['message' => 'Unknown analytics section'], 404);
        }

        $params = $section === 'online'
            ? []
            : ['from' => $from, 'to' => $to, 'page' => $page, 'per_page' => $perPage, 'search' => $search, 'dim' => $dim];
        $data = $this->query->remember($tid, $section, $params, $resolver);
        $data['source'] = 'native';

        return response()->json(['data' => $data]);
    }

    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json([
            'data' => [
                'settings' => AnalyticsSettings::public($tid),
                'editable_roles' => AnalyticsSettings::editableRoles(),
                'source' => 'native',
            ],
        ]);
    }

    public function saveSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $body = $request->all();
        $payload = is_array($body['settings'] ?? null) ? $body['settings'] : $body;
        $saved = AnalyticsSettings::save($tid, is_array($payload) ? $payload : []);
        $this->query->flushCache($tid);

        return response()->json([
            'data' => [
                'settings' => $saved,
                'editable_roles' => AnalyticsSettings::editableRoles(),
                'source' => 'native',
            ],
        ]);
    }

    public function purgeCache(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $this->query->flushCache($tid);
        $days = $this->rollup->rebuildAll($tid);
        $this->rollup->purgeOldEvents($tid);
        $this->query->flushCache($tid);

        return response()->json(['data' => ['ok' => true, 'days_rebuilt' => $days]]);
    }
}
