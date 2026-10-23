<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Same-origin proxy for the ERP public license-renewal contract
 * (WebinoERP /workspace/license-renewal/API.md §1):
 * GET {WEBINO_BASE_URL}/api/v1/public/license-renewal?domain=&return_url=
 *
 * The domain is always the tenant's own domain (never client-supplied), so a site
 * can only read its own renewal info. The ERP body/status is passed through as-is.
 */
class LicenseRenewalController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $tenant = $request->attributes->get('public_tenant') ?? $request->attributes->get('tenant') ?? Tenant::query()->first();
        $domain = self::normalizeDomain((string) ($tenant?->domain ?: $request->getHost()));
        if ($domain === '') {
            return response()->json(['message' => 'دامنهٔ سایت مشخص نیست.'], 422);
        }

        $base = rtrim((string) config('services.webino.base_url'), '/');
        if ($base === '') {
            return response()->json(['message' => 'اتصال به سامانهٔ وبینا پیکربندی نشده است.'], 503);
        }

        $query = ['domain' => $domain];
        $returnUrl = (string) $request->query('return_url', '');
        if ($returnUrl !== '' && str_starts_with($returnUrl, 'https://') && strlen($returnUrl) <= 500) {
            $query['return_url'] = $returnUrl; // ERP validates the host again.
        }

        try {
            $res = Http::timeout(10)->acceptJson()->get($base.'/api/v1/public/license-renewal', $query);
        } catch (Throwable) {
            return response()->json(['message' => 'ارتباط با سامانهٔ وبینا برقرار نشد.'], 502)->header('Cache-Control', 'no-store');
        }

        $body = $res->json();
        if (! is_array($body)) {
            return response()->json(['message' => 'پاسخ نامعتبر از سامانهٔ وبینا.'], 502)->header('Cache-Control', 'no-store');
        }

        $out = response()->json($body, $res->status())->header('Cache-Control', 'no-store');
        if ($res->status() === 429 && $res->header('Retry-After') !== '') {
            $out->header('Retry-After', $res->header('Retry-After'));
        }

        return $out;
    }

    public static function normalizeDomain(string $d): string
    {
        $d = strtolower(trim($d));
        $d = preg_replace('#^https?://#', '', $d) ?? $d;
        $d = explode('/', $d)[0];
        $d = preg_replace('/:\d+$/', '', $d) ?? $d;

        return (string) preg_replace('/^www\./', '', $d);
    }
}
