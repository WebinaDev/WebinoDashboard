<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Security\CaptchaService;
use App\Services\Security\SecurityAuditService;
use App\Services\Security\SecuritySettings;
use Illuminate\Http\Request;

/** Security hub: audit score, apply fixes, captcha challenge for public surfaces. */
class SecurityHubController extends Controller
{
    public function audit(Request $request, SecurityAuditService $audit): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        return response()->json([
            'data' => [
                'settings' => SecuritySettings::get($tenantId),
                'insights' => $audit->insights($tenantId),
            ],
        ]);
    }

    public function applyFix(Request $request, SecurityAuditService $audit): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'check_id' => ['required', 'string', 'max:64'],
        ]);
        $tenantId = (int) $request->user()->tenant_id;
        $result = $audit->applyFix($tenantId, (string) $data['check_id']);

        return response()->json(['data' => $result]);
    }

    /** Public captcha config for storefront widgets (site key only). */
    public function publicCaptchaConfig(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) $request->attributes->get('public_tenant_id');
        $surface = (string) $request->query('surface', 'forms');
        if (! in_array($surface, ['forms', 'login', 'checkout', 'comments'], true)) {
            $surface = 'forms';
        }

        return response()->json(['data' => CaptchaService::publicConfig($tenantId, $surface)]);
    }

    public function publicCaptchaChallenge(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) $request->attributes->get('public_tenant_id');
        $cfg = CaptchaService::publicConfig($tenantId, (string) $request->query('surface', 'forms'));
        if ($cfg['provider'] !== 'numeric') {
            return response()->json(['message' => __('api.forbidden'), 'errors' => ['code' => 'CAPTCHA_NOT_NUMERIC']], 422);
        }

        return response()->json(['data' => CaptchaService::issueNumeric($tenantId)]);
    }
}
