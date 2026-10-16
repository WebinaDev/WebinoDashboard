<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SecurityEvent;
use Illuminate\Http\Request;

/** Forensics log + summary for the security dashboard. */
class SecurityEventsController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $q = SecurityEvent::query()->where('tenant_id', $request->user()->tenant_id)->orderByDesc('id');
        if ($type = (string) $request->query('type', '')) {
            $q->where('type', $type);
        }
        if ($ip = trim((string) $request->query('ip', ''))) {
            $q->where('ip', $ip);
        }
        $rows = $q->paginate(min(100, max(1, (int) $request->query('per_page', 50))));

        return response()->json(['data' => $rows->items(), 'meta' => ['total' => $rows->total(), 'current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage()]]);
    }

    public function summary(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $since = now()->subDays(max(1, min(90, (int) $request->query('days', 7))));
        $base = SecurityEvent::query()->where('tenant_id', $tid)->where('created_at', '>=', $since);
        $byType = (clone $base)->selectRaw('type, count(*) as c')->groupBy('type')->pluck('c', 'type');
        $topIps = (clone $base)->whereNotNull('ip')->selectRaw('ip, count(*) as c')->groupBy('ip')->orderByDesc('c')->limit(10)->get();
        $topCountries = (clone $base)->whereNotNull('country')->selectRaw('country, count(*) as c')->groupBy('country')->orderByDesc('c')->limit(10)->get();

        return response()->json(['data' => ['by_type' => $byType, 'top_ips' => $topIps, 'top_countries' => $topCountries, 'since' => $since->toIso8601String()]]);
    }
}
