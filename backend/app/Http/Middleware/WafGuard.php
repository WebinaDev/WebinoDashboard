<?php

namespace App\Http\Middleware;

use App\Services\Security\SecuritySettings;
use App\Services\Tenant\TenantResolver;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lightweight request WAF: detects common injection patterns.
 * When enforce=false, findings are logged only (monitor mode).
 */
class WafGuard
{
    /** @var list<string> */
    private const PATTERNS = [
        '/(\bunion\b.+\bselect\b)/i',
        '/(\bor\b\s+1\s*=\s*1)/i',
        '/(<script[\s>])/i',
        '/(javascript\s*:)/i',
        '/(\bdrop\b\s+\btable\b)/i',
        '/(\bexec\b\s*\()/i',
        '/(\/\.\.\/)/',
        '/(\binto\b\s+\boutfile\b)/i',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $tenantId = $this->resolveTenantId($request);
        if ($tenantId <= 0) {
            return $next($request);
        }

        $settings = SecuritySettings::get($tenantId);
        if (empty($settings['general']['enabled']) || empty($settings['waf']['enabled'])) {
            return $next($request);
        }

        if ($blocked = $this->geoBlock($request, $tenantId, $settings)) {
            return $blocked;
        }

        $haystack = $this->haystack($request);
        foreach (self::PATTERNS as $pattern) {
            if (! preg_match($pattern, $haystack)) {
                continue;
            }
            Log::warning('security.waf_hit', [
                'tenant_id' => $tenantId,
                'path' => $request->path(),
                'ip' => $request->ip(),
                'pattern' => $pattern,
                'enforce' => ! empty($settings['waf']['enforce']),
            ]);
            \App\Services\Security\SecurityEventLogger::record($tenantId, ! empty($settings['waf']['enforce']) ? 'waf_block' : 'waf_hit', $request, ['pattern' => $pattern]);
            if (! empty($settings['waf']['enforce'])) {
                return response()->json([
                    'message' => __('api.forbidden'),
                    'errors' => ['code' => 'WAF_BLOCKED'],
                ], 403);
            }
            break;
        }

        return $next($request);
    }

    /** Geo block/allow by edge country header. Skips staff sessions, webhooks and payment callbacks. */
    private function geoBlock(Request $request, int $tenantId, array $settings): ?Response
    {
        $geo = $settings['geo'] ?? [];
        if (empty($geo['enabled']) || empty($geo['countries'])) {
            return null;
        }
        $path = ltrim($request->path(), '/');
        foreach (['api/v1/public/bots/', 'api/v1/payments/callback', 'api/v1/health', 'up'] as $exempt) {
            if (str_starts_with($path, $exempt)) {
                return null;
            }
        }
        $user = $request->user();
        if ($user && ($user->role ?? 'customer') !== 'customer') {
            return null;
        }
        $country = \App\Services\Security\SecurityEventLogger::country($request, (string) ($geo['header'] ?? ''));
        if ($country === null) {
            return null; // No trusted header → never block blindly.
        }
        $listed = in_array($country, (array) $geo['countries'], true);
        $deny = ($geo['mode'] ?? 'block') === 'allow' ? ! $listed : $listed;
        if (! $deny) {
            return null;
        }
        \App\Services\Security\SecurityEventLogger::record($tenantId, 'geo_block', $request, ['country' => $country]);

        return response()->json(['message' => __('api.forbidden'), 'errors' => ['code' => 'GEO_BLOCKED']], 403);
    }

    private function haystack(Request $request): string
    {
        $parts = [
            $request->getQueryString() ?? '',
            $request->getContent() ?: '',
        ];
        foreach ($request->request->all() as $value) {
            if (is_scalar($value)) {
                $parts[] = (string) $value;
            }
        }

        return implode("\n", $parts);
    }

    private function resolveTenantId(Request $request): int
    {
        $user = $request->user();
        if ($user && isset($user->tenant_id)) {
            return (int) $user->tenant_id;
        }

        try {
            $tenant = app(TenantResolver::class)->identifyFromRequest($request);

            return $tenant ? (int) $tenant->id : 0;
        } catch (\Throwable) {
            return 0;
        }
    }
}
