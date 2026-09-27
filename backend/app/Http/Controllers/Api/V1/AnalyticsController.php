<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Analytics\AnalyticsQuery;
use App\Services\Analytics\AnalyticsRollup;
use App\Services\Analytics\AnalyticsSettings;
use Illuminate\Http\Request;

class AnalyticsController extends Controller
{
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
        $range = in_array($section, ['month-summary', 'commerce'], true)
            ? $this->query->parseMonthOrRange($fromTs, $toTs)
            : $this->query->parseRange($fromTs, $toTs, $days);
        $from = $range['from'];
        $to = $range['to'];

        $data = match ($section) {
            'overview' => $this->query->overview($tid, $from, $to),
            'visitors' => $this->query->visitors($tid, $from, $to),
            'pages' => $this->query->pages(
                $tid, $from, $to,
                max(1, (int) $request->query('page', 1)),
                max(1, min(100, (int) $request->query('per_page', 20))),
                (string) $request->query('search', '')
            ),
            'referrals' => $this->query->referrals($tid, $from, $to),
            'geo' => $this->query->geo($tid, $from, $to, (string) $request->query('dim', 'country')),
            'devices' => $this->query->devices($tid, $from, $to, (string) $request->query('dim', 'browser')),
            'online' => $this->query->online($tid),
            'commerce' => $this->query->commerce($tid, $from, $to),
            'compare' => $this->query->compare($tid, $from, $to),
            'seo' => $this->query->seo($tid, $from, $to),
            'support' => $this->query->support($tid, $from, $to),
            'content' => $this->query->content($tid, $from, $to),
            'month-summary' => $this->query->monthSummary($tid, $from, $to),
            default => null,
        };
        if ($data === null) {
            return response()->json(['message' => 'Unknown analytics section'], 404);
        }

        return response()->json(['data' => $data]);
    }

    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json([
            'data' => [
                'settings' => AnalyticsSettings::public($tid),
                'editable_roles' => ['admin', 'staff', 'customer'],
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

        return response()->json([
            'data' => [
                'settings' => $saved,
                'editable_roles' => ['admin', 'staff', 'customer'],
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

        return response()->json(['data' => ['ok' => true, 'days_rebuilt' => $days]]);
    }
}
