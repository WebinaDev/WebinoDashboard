<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;

class TwoFactorController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'enabled' => (bool) ($user->two_factor_secret && $user->two_factor_confirmed_at),
            'confirmed' => (bool) $user->two_factor_confirmed_at,
            'has_recovery_codes' => (bool) $user->two_factor_recovery_codes,
        ]);
    }

    public function enable(Request $request): JsonResponse
    {
        $user = $request->user();
        $google2fa = new Google2FA;
        $secret = $google2fa->generateSecretKey();
        $user->two_factor_secret = encrypt($secret);
        $user->two_factor_confirmed_at = null;
        $user->two_factor_recovery_codes = null;
        $user->save();

        $otpauth = $google2fa->getQRCodeUrl(
            config('app.name'),
            $user->email,
            $secret
        );

        return response()->json([
            'secret' => $secret,
            'otpauth_url' => $otpauth,
        ]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $data = $request->validate(['otp' => ['required', 'string', 'size:6']]);
        $user = $request->user();
        $google2fa = new Google2FA;
        if (! $user->two_factor_secret || ! $google2fa->verifyKey(decrypt($user->two_factor_secret), $data['otp'])) {
            return response()->json(['message' => __('auth.two_factor_invalid')], 422);
        }

        $codes = [];
        for ($i = 0; $i < 8; $i++) {
            $codes[] = Str::upper(Str::random(4).'-'.Str::random(4));
        }
        $user->two_factor_confirmed_at = now();
        $user->two_factor_recovery_codes = encrypt(json_encode($codes));
        $user->save();

        return response()->json([
            'message' => __('auth.two_factor_enabled'),
            'recovery_codes' => $codes,
        ]);
    }

    public function disable(Request $request): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string'],
            'otp' => ['required', 'string', 'size:6'],
        ]);
        $user = $request->user();
        if (! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => __('auth.failed')], 422);
        }
        $google2fa = new Google2FA;
        if (! $user->two_factor_secret || ! $google2fa->verifyKey(decrypt($user->two_factor_secret), $data['otp'])) {
            return response()->json(['message' => __('auth.two_factor_invalid')], 422);
        }
        $user->two_factor_secret = null;
        $user->two_factor_confirmed_at = null;
        $user->two_factor_recovery_codes = null;
        $user->save();

        return response()->json(['message' => __('auth.two_factor_disabled')]);
    }

    public function verify(Request $request): JsonResponse
    {
        return $this->confirm($request);
    }
}
