<?php

namespace App\Services\Security;

use App\Models\SecurityEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/** Forensics trail (WP shield forensics/audit, Laravel-native): persisted security events per tenant. */
final class SecurityEventLogger
{
    public const SEVERITY = [
        'waf_hit' => 'medium', 'waf_block' => 'high', 'geo_block' => 'medium',
        'login_lockout' => 'high', 'login_failed' => 'low', 'rate_limited' => 'low',
    ];

    public static function record(?int $tenantId, string $type, ?Request $request = null, array $context = []): void
    {
        try {
            if ($tenantId && empty(SecuritySettings::get($tenantId)['forensics']['log_events'])) {
                return;
            }
            $request ??= request();
            SecurityEvent::query()->create([
                'tenant_id' => $tenantId ?: null,
                'type' => $type,
                'severity' => self::SEVERITY[$type] ?? 'low',
                'ip' => $request?->ip(),
                'country' => self::country($request),
                'method' => $request?->method(),
                'path' => $request ? mb_substr('/'.ltrim($request->path(), '/'), 0, 512) : null,
                'user_agent' => $request ? mb_substr((string) $request->userAgent(), 0, 512) : null,
                'user_id' => $request?->user()?->id,
                'context' => $context ?: null,
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('security.event_log_failed', ['type' => $type, 'error' => $e->getMessage()]);
        }
    }

    /** Country from a trusted edge header (Cloudflare / ArvanCloud / nginx geoip). No local GeoIP DB. */
    public static function country(?Request $request, ?string $header = null): ?string
    {
        if (! $request) {
            return null;
        }
        foreach (array_filter([$header, 'CF-IPCountry', 'AR-Real-Country', 'X-Country-Code', 'X-Geo-Country']) as $h) {
            $v = strtoupper(trim((string) $request->header($h, '')));
            if (preg_match('/^[A-Z]{2}$/', $v) && $v !== 'XX') {
                return $v;
            }
        }

        return null;
    }

    public static function prune(): int
    {
        $total = 0;
        foreach (SecurityEvent::query()->distinct()->pluck('tenant_id') as $tid) {
            $days = $tid ? (int) (SecuritySettings::get((int) $tid)['forensics']['retention_days'] ?? 30) : 30;
            $total += SecurityEvent::query()->where('tenant_id', $tid)->where('created_at', '<', now()->subDays(max(1, $days)))->delete();
        }

        return $total;
    }
}
