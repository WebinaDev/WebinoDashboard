<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;
use PragmaRX\Google2FA\Google2FA;

class AuthController extends Controller
{
    public function login(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'otp' => ['nullable', 'string'],
            'recovery_code' => ['nullable', 'string'],
        ]);

        /** @var User|null $user */
        $user = User::query()->where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => [__('api.invalid_credentials')],
            ]);
        }

        if ($user->two_factor_secret && $user->two_factor_confirmed_at) {
            $verified = false;
            $otp = $data['otp'] ?? '';
            $recovery = $data['recovery_code'] ?? '';

            if ($recovery !== '' && $user->two_factor_recovery_codes) {
                $codes = json_decode(decrypt($user->two_factor_recovery_codes), true) ?? [];
                if (in_array($recovery, $codes, true)) {
                    $verified = true;
                    $codes = array_values(array_filter($codes, fn ($c) => $c !== $recovery));
                    $user->two_factor_recovery_codes = encrypt(json_encode($codes));
                    $user->save();
                }
            } elseif ($otp !== '') {
                $google2fa = new Google2FA;
                $verified = $google2fa->verifyKey(decrypt($user->two_factor_secret), $otp);
            }

            if (! $verified) {
                return response()->json([
                    'two_factor_required' => true,
                    'message' => __('auth.two_factor_required'),
                ], 422);
            }
        }

        $token = $user->createToken('spa')->plainTextToken;

        $response = response()->json([
            'user' => $user->load('tenant'),
            'password_must_change' => (bool) $user->password_must_change,
            'setup_completed' => (bool) ($user->tenant?->setup_completed ?? true),
        ]);

        return $this->attachAuthCookie($response, $token);
    }

    public function session(Request $request): \Illuminate\Http\JsonResponse
    {
        return $this->login($request);
    }

    public function refresh(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }

        $request->user()?->currentAccessToken()?->delete();

        $token = $user->createToken('spa')->plainTextToken;

        $response = response()->json([
            'user' => $user->load('tenant'),
            'refreshed' => true,
        ]);

        return $this->attachAuthCookie($response, $token);
    }

    public function gate(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $this->resolveAuthenticatedUser($request);
        $authenticated = $user !== null;

        $setupCompleted = null;
        if ($authenticated) {
            $setupCompleted = (bool) ($user->tenant?->setup_completed ?? true);
        }

        return response()->json([
            'data' => [
                'authenticated' => $authenticated,
                'setup_completed' => $setupCompleted,
                'password_must_change' => $authenticated
                    ? (bool) $user->password_must_change
                    : false,
            ],
        ]);
    }

    public function check(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['authenticated' => false], 401);
        }

        return response()->json([
            'authenticated' => true,
            'password_must_change' => (bool) $user->password_must_change,
            'user' => $user->load('tenant'),
        ]);
    }

    public function changePassword(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }

        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => [__('auth.password_current_invalid')],
            ]);
        }

        $user->password = $data['password'];
        $user->password_must_change = false;
        $user->save();

        return response()->json([
            'message' => __('auth.password_changed'),
            'password_must_change' => false,
        ]);
    }

    public function logout(Request $request): \Illuminate\Http\JsonResponse
    {
        $cookieName = config('auth.cookie_name', 'webino_auth_token');
        $cookieToken = $request->cookie($cookieName);
        if (is_string($cookieToken) && $cookieToken !== '') {
            PersonalAccessToken::findToken($cookieToken)?->delete();
        }

        $bearer = $request->bearerToken();
        if (is_string($bearer) && $bearer !== '') {
            PersonalAccessToken::findToken($bearer)?->delete();
        }

        $request->user()?->currentAccessToken()?->delete();

        return $this->clearAuthCookie(response()->json(['message' => __('api.logged_out')]));
    }

    public function user(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json($request->user()->load('tenant'));
    }

    private function attachAuthCookie(\Illuminate\Http\JsonResponse $response, string $token): \Illuminate\Http\JsonResponse
    {
        return $response->cookie(
            config('auth.cookie_name', 'webino_auth_token'),
            $token,
            config('auth.cookie_max_minutes', 60 * 24 * 7),
            '/',
            null,
            app()->environment('production'),
            true,
            false,
            'lax'
        );
    }

    private function clearAuthCookie(\Illuminate\Http\JsonResponse $response): \Illuminate\Http\JsonResponse
    {
        return $response->cookie(
            config('auth.cookie_name', 'webino_auth_token'),
            '',
            -1,
            '/',
            null,
            app()->environment('production'),
            true,
            false,
            'lax'
        );
    }

    private function resolveAuthenticatedUser(Request $request): ?User
    {
        if ($request->bearerToken()) {
            $accessToken = PersonalAccessToken::findToken($request->bearerToken());
            if ($accessToken?->tokenable instanceof User) {
                return $accessToken->tokenable->load('tenant');
            }
        }

        $cookieToken = $request->cookie(config('auth.cookie_name', 'webino_auth_token'));
        if (! $cookieToken) {
            return null;
        }

        $accessToken = PersonalAccessToken::findToken($cookieToken);
        if ($accessToken?->tokenable instanceof User) {
            return $accessToken->tokenable->load('tenant');
        }

        return null;
    }
}
