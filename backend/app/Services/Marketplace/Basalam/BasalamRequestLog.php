<?php

namespace App\Services\Marketplace\Basalam;

use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Request status tracker over `basalam_request_logs` (port of RequestStatusTracker).
 */
class BasalamRequestLog
{
    public static function record(int $tenantId, string $url, int $status, bool $success, int $ms, ?string $error = null): void
    {
        try {
            DB::table('basalam_request_logs')->insert([
                'tenant_id' => $tenantId,
                'request_url' => mb_substr(preg_replace('/([?&](?:token|access_token)=)[^&]+/', '$1***', $url) ?? $url, 0, 500),
                'status_code' => max(0, min(65535, $status)),
                'success' => $success,
                'response_time_ms' => max(0, $ms),
                'error_message' => $error !== null ? mb_substr($error, 0, 2000) : null,
                'created_at' => now(),
            ]);
        } catch (Throwable) {
        }
    }

    public static function category(int $status): string
    {
        return match (true) {
            $status === 0 => 'network',
            $status >= 200 && $status < 300 => 'success',
            $status === 401 || $status === 403 => 'auth',
            $status === 429 => 'rate_limit',
            $status === 408 || $status === 504 => 'timeout',
            $status >= 500 => 'server',
            default => 'client',
        };
    }

    /** @return array{total: int, success: int, failed: int, avg_ms: int, by_category: array<string, int>, last_error: ?array<string, mixed>} */
    public static function summary(int $tenantId, int $hours = 24): array
    {
        $rows = DB::table('basalam_request_logs')
            ->where('tenant_id', $tenantId)
            ->where('created_at', '>=', now()->subHours($hours))
            ->get(['status_code', 'success', 'response_time_ms']);
        $by = [];
        foreach ($rows as $row) {
            $cat = self::category((int) $row->status_code);
            $by[$cat] = ($by[$cat] ?? 0) + 1;
        }
        $last = DB::table('basalam_request_logs')
            ->where('tenant_id', $tenantId)
            ->where('success', false)
            ->orderByDesc('id')
            ->first(['request_url', 'status_code', 'error_message', 'created_at']);
        $success = $rows->where('success', true)->count();

        return [
            'total' => $rows->count(),
            'success' => $success,
            'failed' => $rows->count() - $success,
            'avg_ms' => (int) round((float) $rows->avg('response_time_ms')),
            'by_category' => $by,
            'last_error' => $last ? (array) $last : null,
        ];
    }

    public static function prune(int $days = 7): void
    {
        DB::table('basalam_request_logs')->where('created_at', '<', now()->subDays($days))->delete();
    }
}
