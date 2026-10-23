<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-to-server auth for ERP → site calls (Customer 360 Hub link).
 * Same credentials as /provision/*: X-Provision-Token must equal TENANT_PROVISION_TOKEN and
 * X-Provision-Signature = HMAC-SHA256(raw body, WEBINO_PROVISION_HMAC_SECRET).
 * Additionally the JSON body must carry `ts` (unix seconds) within ±300s to block replays.
 */
class VerifyErpLinkSignature
{
    public const MAX_SKEW = 300;

    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) env('TENANT_PROVISION_TOKEN', '');
        $token = (string) $request->header('X-Provision-Token', '');
        if ($expected === '' || $token === '' || ! hash_equals($expected, $token)) {
            return response()->json(['message' => __('api.invalid_provision_token')], 403);
        }
        $secret = (string) config('services.webino.provision_hmac_secret', '');
        if ($secret === '') {
            return response()->json(['message' => __('api.hmac_secret_missing')], 503);
        }
        $sig = (string) $request->header('X-Provision-Signature', '');
        if ($sig === '' || ! hash_equals(hash_hmac('sha256', $request->getContent(), $secret), $sig)) {
            return response()->json(['message' => __('api.invalid_signature')], 403);
        }
        $ts = (int) $request->input('ts', 0);
        if ($ts <= 0 || abs(time() - $ts) > self::MAX_SKEW) {
            return response()->json(['message' => 'stale_request'], 403);
        }

        return $next($request);
    }
}
