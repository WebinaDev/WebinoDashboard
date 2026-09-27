<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Auth\OtpAuthService;
use App\Services\Tenant\TenantResolver;
use App\Support\AuthCookie;
use Illuminate\Http\Request;

class OtpAuthController extends Controller
{
    public function sendOtp(Request $request, OtpAuthService $otp, TenantResolver $tenants): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string', 'max:255'],
            'purpose' => ['nullable', 'string', 'in:login,register'],
        ]);

        $tenant = $tenants->identifyFromRequest($request);
        if (! $tenant) {
            return response()->json(['message' => __('api.tenant_not_found')], 404);
        }

        $result = $otp->send($tenant, $data['identifier'], $data['purpose'] ?? 'login');

        return response()->json(['data' => $result]);
    }

    public function verifyOtp(Request $request, OtpAuthService $otp, TenantResolver $tenants): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:32'],
            'purpose' => ['nullable', 'string', 'in:login,register'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $tenant = $tenants->identifyFromRequest($request);
        if (! $tenant) {
            return response()->json(['message' => __('api.tenant_not_found')], 404);
        }

        $verified = $otp->verify(
            $tenant,
            $data['identifier'],
            $data['code'],
            $data['purpose'] ?? 'login',
        );

        $user = $verified['user'];
        $token = $user->createToken('spa-otp')->plainTextToken;

        $remember = (bool) ($data['remember'] ?? true);
        $cookieMinutes = $remember
            ? (int) config('auth.cookie_max_minutes', 60 * 24 * 7)
            : (int) config('auth.cookie_session_minutes', 60 * 12);

        $response = response()->json([
            'data' => [
                'ok' => true,
                'created' => $verified['created'],
                'user' => $user->load('tenant'),
                'password_must_change' => (bool) $user->password_must_change,
                'setup_completed' => (bool) ($user->tenant?->setup_completed ?? true),
            ],
        ]);

        return AuthCookie::attach($response, $token, $request, $cookieMinutes);
    }
}
