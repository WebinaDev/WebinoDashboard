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
