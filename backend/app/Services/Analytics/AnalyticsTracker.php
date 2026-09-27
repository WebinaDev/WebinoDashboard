<?php

namespace App\Services\Analytics;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

final class AnalyticsTracker
{
    /**
     * @param  array<string, mixed>  $payload
     * @return array{ok: bool, skipped?: string, status?: int}
     */
    public function record(int $tenantId, array $payload, Request $request): array
    {
        if (! AnalyticsSettings::trackingEnabled($tenantId)) {
            return ['ok' => false, 'skipped' => 'disabled', 'status' => 403];
        }

        $type = strtolower((string) ($payload['type'] ?? 'pageview'));
        if ($type === 'session') {
            return $this->recordSession($tenantId, $payload, $request);
        }

        $key = 'analytics_hit:'.$tenantId.':'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 120)) {
            return ['ok' => false, 'skipped' => 'rate_limit', 'status' => 429];
        }
        RateLimiter::hit($key, 60);

        $skip = $this->shouldSkip($tenantId, $request, (string) ($payload['uri'] ?? ''));
        if ($skip !== null) {
            return ['ok' => true, 'skipped' => $skip];
        }

        $ua = (string) $request->userAgent();
        if (AnalyticsUserAgent::isBot($ua)) {
            return ['ok' => true, 'skipped' => 'bot'];
        }

        $settings = AnalyticsSettings::get($tenantId);
        $ip = $this->clientIp($request);
        $anon = ! empty($settings['anonymize_ip']) ? $this->anonymizeIp($ip) : $ip;
        $hash = hash('sha256', $anon.'|'.$ua.'|'.($settings['daily_salt'] ?? ''));
        $parsed = AnalyticsUserAgent::parse($ua);
        $uri = $this->normalizeUri((string) ($payload['uri'] ?? '/'));
        $referrer = mb_substr((string) ($payload['referrer'] ?? ''), 0, 512);
        $siteHost = (string) (parse_url((string) $request->headers->get('Origin', ''), PHP_URL_HOST)
            ?: $request->getHost());
        $ref = AnalyticsReferrer::categorize($referrer, $siteHost);
        $geo = $this->geo($request);
        $now = Carbon::now('UTC');

        DB::table('analytics_events')->insert([
            'tenant_id' => $tenantId,
            'created_at' => $now,
            'visitor_hash' => $hash,
            'uri' => $uri,
            'post_id' => max(0, (int) ($payload['post_id'] ?? 0)),
            'referrer' => $referrer,
            'ref_category' => $ref['category'],
            'ref_source' => mb_substr($ref['source'], 0, 191),
            'country' => $geo['country'],
            'city' => $geo['city'],
            'browser' => $parsed['browser'],
            'os' => $parsed['os'],
            'device' => $parsed['device'],
            'utm_source' => mb_substr((string) ($payload['utm_source'] ?? ''), 0, 100),
            'utm_medium' => mb_substr((string) ($payload['utm_medium'] ?? ''), 0, 100),
            'utm_campaign' => mb_substr((string) ($payload['utm_campaign'] ?? ''), 0, 100),
            'session_id' => mb_substr((string) ($payload['session_id'] ?? ''), 0, 64),
            'duration_ms' => 0,
            'is_exit' => false,
            'is_bounce' => false,
        ]);

        $existing = DB::table('analytics_visitors')
            ->where('tenant_id', $tenantId)
            ->where('visitor_hash', $hash)
            ->first();
        if ($existing) {
            DB::table('analytics_visitors')
                ->where('tenant_id', $tenantId)
                ->where('visitor_hash', $hash)
                ->update([
                    'last_seen' => $now,
                    'hits' => (int) $existing->hits + 1,
                    'country' => $geo['country'] !== '' ? $geo['country'] : $existing->country,
                ]);
        } else {
            DB::table('analytics_visitors')->insert([
                'tenant_id' => $tenantId,
                'visitor_hash' => $hash,
                'first_seen' => $now,
                'last_seen' => $now,
                'hits' => 1,
                'country' => $geo['country'],
            ]);
        }

        return ['ok' => true];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{ok: bool, skipped?: string, status?: int}
     */
    private function recordSession(int $tenantId, array $payload, Request $request): array
    {
        $key = 'analytics_session:'.$tenantId.':'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 240)) {
            return ['ok' => false, 'skipped' => 'rate_limit', 'status' => 429];
        }
        RateLimiter::hit($key, 60);

        $sessionId = mb_substr(trim((string) ($payload['session_id'] ?? '')), 0, 64);
        if ($sessionId === '') {
            return ['ok' => true, 'skipped' => 'empty_session'];
        }
        $duration = max(0, min(86400000, (int) ($payload['duration_ms'] ?? 0)));
        $pageCount = max(1, min(500, (int) ($payload['page_count'] ?? 1)));
        $isExit = ! empty($payload['is_exit']);
        $isBounce = $pageCount === 1 && $duration < 10000;

        $row = DB::table('analytics_events')
            ->where('tenant_id', $tenantId)
            ->where('session_id', $sessionId)
            ->orderByDesc('id')
            ->first(['id']);
        if ($row) {
            DB::table('analytics_events')->where('id', $row->id)->update([
                'duration_ms' => $duration,
                'is_exit' => $isExit,
                'is_bounce' => $isBounce,
            ]);
        }

        return ['ok' => true];
    }

    private function shouldSkip(int $tenantId, Request $request, string $uri): ?string
    {
        $settings = AnalyticsSettings::get($tenantId);
        $user = $request->user();
        if ($user) {
            if (empty($settings['record_logged_in'])) {
                return 'logged_in';
            }
            $role = strtolower((string) ($user->role ?? ''));
            $excluded = array_map('strtolower', (array) ($settings['exclude_roles'] ?? []));
            if ($role !== '' && in_array($role, $excluded, true)) {
                return 'role';
            }
        }

        $ip = $this->clientIp($request);
        foreach (preg_split('/[\s,]+/', (string) ($settings['exclude_ips'] ?? '')) ?: [] as $rule) {
            $rule = trim($rule);
            if ($rule !== '' && (str_contains($ip, $rule) || $ip === $rule)) {
                return 'ip';
            }
        }

        $path = parse_url($uri, PHP_URL_PATH) ?: $uri;
        foreach (preg_split("/\r\n|\n|\r/", (string) ($settings['exclude_urls'] ?? '')) ?: [] as $rule) {
            $rule = trim($rule);
            if ($rule === '') {
                continue;
            }
            if (str_starts_with($path, $rule) || str_contains($path, $rule)) {
                return 'url';
            }
        }

        return null;
    }

    /** @return array{country: string, city: string} */
    private function geo(Request $request): array
    {
        $c = strtoupper((string) $request->header('CF-IPCountry', ''));
        if (preg_match('/^[A-Z]{2}$/', $c) && $c !== 'XX') {
            return ['country' => $c, 'city' => ''];
        }

        return ['country' => '', 'city' => ''];
    }

    private function clientIp(Request $request): string
    {
        return (string) ($request->ip() ?? '0.0.0.0');
    }

    private function anonymizeIp(string $ip): string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $parts = explode('.', $ip);
            $parts[3] = '0';

            return implode('.', $parts);
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $parts = explode(':', $ip);
            $keep = array_slice($parts, 0, 4);

            return implode(':', $keep).'::';
        }

        return $ip;
    }

    private function normalizeUri(string $uri): string
    {
        $uri = trim($uri);
        if ($uri === '') {
            return '/';
        }
        if (str_starts_with($uri, 'http://') || str_starts_with($uri, 'https://')) {
            $path = parse_url($uri, PHP_URL_PATH) ?: '/';
            $query = parse_url($uri, PHP_URL_QUERY);

            return mb_substr($query ? $path.'?'.$query : $path, 0, 512);
        }

        return mb_substr($uri, 0, 512);
    }
}
