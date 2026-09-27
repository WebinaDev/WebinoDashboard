<?php

namespace App\Services\Analytics;

use App\Models\Tenant;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

final class AnalyticsRollup
{
    public function timezone(): string
    {
        $tz = (string) config('app.timezone', 'UTC');

        return $tz === 'UTC' ? 'Asia/Tehran' : $tz;
    }

    /** @return array{0: string, 1: string} GMT start/end inclusive for local days */
    public function gmtBounds(string $fromDay, string $toDay): array
    {
        $tz = new \DateTimeZone($this->timezone());
        $start = Carbon::createFromFormat('Y-m-d H:i:s', $fromDay.' 00:00:00', $tz)->utc()->format('Y-m-d H:i:s');
        $end = Carbon::createFromFormat('Y-m-d H:i:s', $toDay.' 23:59:59', $tz)->utc()->format('Y-m-d H:i:s');

        return [$start, $end];
    }

    public function localDayExpr(string $column = 'created_at'): string
    {
        $tz = $this->timezone();
        // Convert stored UTC datetime to local date in SQL (MySQL).
        return "DATE(CONVERT_TZ({$column}, '+00:00', '".addslashes($tz)."'))";
    }

    public function rollupDay(int $tenantId, string $day): void
    {
        [$start, $end] = $this->gmtBounds($day, $day);

        $totals = DB::table('analytics_events')
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$start, $end])
            ->selectRaw('COUNT(*) as views')
            ->selectRaw('COUNT(DISTINCT visitor_hash) as visitors')
            ->selectRaw("COUNT(DISTINCT CASE WHEN session_id != '' THEN session_id END) as sessions")
            ->selectRaw('SUM(CASE WHEN is_bounce = 1 AND is_exit = 1 THEN 1 ELSE 0 END) as bounces')
            ->selectRaw('SUM(CASE WHEN is_exit = 1 THEN duration_ms ELSE 0 END) as duration_sum_ms')
            ->first();

        DB::table('analytics_daily_totals')->updateOrInsert(
            ['tenant_id' => $tenantId, 'day' => $day],
            [
                'visitors' => (int) ($totals->visitors ?? 0),
                'views' => (int) ($totals->views ?? 0),
                'sessions' => (int) ($totals->sessions ?? 0),
                'bounces' => (int) ($totals->bounces ?? 0),
                'duration_sum_ms' => (int) ($totals->duration_sum_ms ?? 0),
            ]
        );

        DB::table('analytics_page_daily')->where('tenant_id', $tenantId)->where('day', $day)->delete();
        $pages = DB::table('analytics_events')
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$start, $end])
            ->selectRaw('post_id, uri, COUNT(*) as views')
            ->groupBy('post_id', 'uri')
            ->get();
        foreach ($pages as $p) {
            DB::table('analytics_page_daily')->insert([
                'tenant_id' => $tenantId,
                'day' => $day,
                'post_id' => (int) $p->post_id,
                'uri_key' => mb_substr((string) $p->uri, 0, 191),
                'uri' => (string) $p->uri,
                'views' => (int) $p->views,
            ]);
        }

        DB::table('analytics_referrer_daily')->where('tenant_id', $tenantId)->where('day', $day)->delete();
        $refs = DB::table('analytics_events')
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$start, $end])
            ->selectRaw('ref_category, ref_source, COUNT(*) as visits')
            ->groupBy('ref_category', 'ref_source')
            ->get();
        foreach ($refs as $r) {
            DB::table('analytics_referrer_daily')->insert([
                'tenant_id' => $tenantId,
                'day' => $day,
                'ref_category' => (string) $r->ref_category,
                'ref_source' => mb_substr((string) $r->ref_source, 0, 100),
                'visits' => (int) $r->visits,
            ]);
        }

        DB::table('analytics_device_daily')->where('tenant_id', $tenantId)->where('day', $day)->delete();
        foreach (['browser', 'os', 'device'] as $dim) {
            $rows = DB::table('analytics_events')
                ->where('tenant_id', $tenantId)
                ->whereBetween('created_at', [$start, $end])
                ->selectRaw("{$dim} as dim_value, COUNT(*) as views")
                ->groupBy($dim)
                ->get();
            foreach ($rows as $row) {
                DB::table('analytics_device_daily')->insert([
                    'tenant_id' => $tenantId,
                    'day' => $day,
                    'dim_type' => $dim,
                    'dim_value' => mb_substr((string) $row->dim_value, 0, 50),
                    'views' => (int) $row->views,
                ]);
            }
        }

        DB::table('analytics_geo_daily')->where('tenant_id', $tenantId)->where('day', $day)->delete();
        foreach (['country', 'city'] as $dim) {
            $rows = DB::table('analytics_events')
                ->where('tenant_id', $tenantId)
                ->whereBetween('created_at', [$start, $end])
                ->where($dim, '!=', '')
                ->selectRaw("{$dim} as dim_value, COUNT(*) as views")
                ->groupBy($dim)
                ->get();
            foreach ($rows as $row) {
                DB::table('analytics_geo_daily')->insert([
                    'tenant_id' => $tenantId,
                    'day' => $day,
                    'dim_type' => $dim,
                    'dim_value' => mb_substr((string) $row->dim_value, 0, 80),
                    'views' => (int) $row->views,
                ]);
            }
        }
    }

    public function purgeOldEvents(int $tenantId): int
    {
        $days = max(7, (int) (AnalyticsSettings::get($tenantId)['retention_days'] ?? 90));
        $cutoff = Carbon::now('UTC')->subDays($days)->format('Y-m-d H:i:s');

        return DB::table('analytics_events')
            ->where('tenant_id', $tenantId)
            ->where('created_at', '<', $cutoff)
            ->delete();
    }

    public function rebuildAll(int $tenantId): int
    {
        $expr = $this->localDayExpr();
        $days = DB::table('analytics_events')
            ->where('tenant_id', $tenantId)
            ->selectRaw("DISTINCT {$expr} as day")
            ->orderBy('day')
            ->pluck('day')
            ->filter()
            ->values();
        foreach ($days as $day) {
            $this->rollupDay($tenantId, (string) $day);
        }

        return $days->count();
    }

    public function runDailyForAllTenants(): void
    {
        $tz = $this->timezone();
        $today = Carbon::now($tz)->format('Y-m-d');
        $yesterday = Carbon::now($tz)->subDay()->format('Y-m-d');
        foreach (Tenant::query()->pluck('id') as $tid) {
            $tid = (int) $tid;
            if (! AnalyticsSettings::trackingEnabled($tid)) {
                continue;
            }
            $this->rollupDay($tid, $yesterday);
            $this->rollupDay($tid, $today);
            $this->purgeOldEvents($tid);
        }
    }
}
