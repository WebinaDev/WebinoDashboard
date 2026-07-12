<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function login(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        /** @var User|null $user */
        $user = User::query()->where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Invalid credentials.'],
            ]);
        }

        $token = $user->createToken('spa')->plainTextToken;

        $response = response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user->load('tenant'),
        ]);

        return $this->attachAuthCookie($response, $token);
    }

    public function session(Request $request): \Illuminate\Http\JsonResponse
    {
        return $this->login($request);
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
            'user' => $user->load('tenant'),
        ]);
    }

    public function logout(Request $request): \Illuminate\Http\JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return $this->clearAuthCookie(response()->json(['message' => 'Logged out']));
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
