<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Security\LoginAttemptService;
use App\Services\Tenant\TenantResolver;
use App\Support\AuthCookie;
use App\Support\ImpersonationPayload;
use App\Support\ImpersonationSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;
use PragmaRX\Google2FA\Google2FA;

class AuthController extends Controller
{
    public function login(Request $request, LoginAttemptService $attempts): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'otp' => ['nullable', 'string'],
            'recovery_code' => ['nullable', 'string'],
        ]);

        $tenant = app(TenantResolver::class)->identifyFromRequest($request);
        $tenantId = $tenant ? (int) $tenant->id : 0;
        $ip = (string) ($request->ip() ?? '0.0.0.0');
        $email = (string) $data['email'];

        if ($tenantId > 0 && $attempts->isLocked($tenantId, $email, $ip)) {
            $secs = $attempts->remainingLockSeconds($tenantId, $email, $ip);

            throw ValidationException::withMessages([
                'email' => [__('auth.throttle', ['seconds' => max(1, $secs)])],
            ]);
        }

        /** @var User|null $user */
        $user = User::query()
            ->where('email', $data['email'])
            ->when($tenant, fn ($q) => $q->where('tenant_id', $tenant->id))
            ->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            if ($tenantId > 0) {
                $attempts->recordFailure($tenantId, $email, $ip);
            } elseif ($user) {
                $attempts->recordFailure((int) $user->tenant_id, $email, $ip);
            }
            throw ValidationException::withMessages([
                'email' => [__('api.invalid_credentials')],
            ]);
        }

        $attempts->clear((int) $user->tenant_id, $email, $ip);

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

        return AuthCookie::attach($response, $token, $request);
    }

    public function session(Request $request): \Illuminate\Http\JsonResponse
    {
        return $this->login($request);
    }

    public function panelLogin(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'panel_token' => ['required', 'string', 'min:32', 'max:128'],
        ]);

        $payload = Cache::pull('panel_login:'.$data['panel_token']);
        if (! is_array($payload) || empty($payload['user_id'])) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }

        /** @var User|null $user */
        $user = User::query()->with('tenant')->find((int) $payload['user_id']);
        if (! $user || $user->is_active === false) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }

        $context = is_array($payload['impersonation'] ?? null) ? $payload['impersonation'] : null;
        $issued = $user->createToken($context ? 'spa-impersonation' : 'spa-panel', ['*']);
        if ($context) {
            ImpersonationSession::store((int) $issued->accessToken->id, $context);
        }

        $response = response()->json([
            'user' => $user,
            'password_must_change' => $context ? false : (bool) $user->password_must_change,
            'setup_completed' => $context ? true : (bool) ($user->tenant?->setup_completed ?? true),
            'impersonation' => $context ? ImpersonationPayload::publish($context) : null,
        ]);

        return AuthCookie::attach($response, $issued->plainTextToken, $request);
    }

    public function refresh(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }

        $carried = ImpersonationSession::pull($request);
        $request->user()?->currentAccessToken()?->delete();

        $token = $user->createToken($carried ? 'spa-impersonation' : 'spa', ['*']);
        if ($carried) {
            ImpersonationSession::store((int) $token->accessToken->id, $carried);
        }

        $response = response()->json([
            'user' => $user->load('tenant'),
            'refreshed' => true,
        ]);

        return AuthCookie::attach($response, $token->plainTextToken, $request);
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
        \App\Support\ImpersonationSession::blockSecurityChanges($request);

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
        $tokens = [];
        if (is_string($cookieToken) && $cookieToken !== '') {
            $found = PersonalAccessToken::findToken($cookieToken);
            if ($found) {
                $tokens[] = $found;
            }
        }

        $bearer = $request->bearerToken();
        if (is_string($bearer) && $bearer !== '') {
            $found = PersonalAccessToken::findToken($bearer);
            if ($found) {
                $tokens[] = $found;
            }
        }

        $current = $request->user()?->currentAccessToken();
        if ($current instanceof PersonalAccessToken) {
            $tokens[] = $current;
        }

        $seen = [];
        foreach ($tokens as $token) {
            if (isset($seen[$token->id])) {
                continue;
            }
            $seen[$token->id] = true;
            $stored = ImpersonationSession::forTokenId((int) $token->id);
            if (is_array($stored)) {
                ImpersonationSession::revokeRemote($stored);
                ImpersonationSession::forgetTokenId((int) $token->id);
            }
            $token->delete();
        }

        return AuthCookie::clear(response()->json(['message' => __('api.logged_out')]), $request);
    }

    public function user(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user()->load('tenant');
        $payload = $user->toArray();
        $payload['capabilities'] = app(\App\Support\CapabilityChecker::class)->capabilitiesForUser($user);
        $impersonation = ImpersonationSession::publishFor($request);
        if ($impersonation) {
            $payload['impersonation'] = $impersonation;
        }

        return response()->json($payload);
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
