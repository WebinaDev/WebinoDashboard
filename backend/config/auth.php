<?php

use App\Models\User;

return [

    'defaults' => [
        'guard' => env('AUTH_GUARD', 'web'),
        'passwords' => env('AUTH_PASSWORD_BROKER', 'users'),
    ],

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],
    ],

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => env('AUTH_MODEL', User::class),
        ],
    ],

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => env('AUTH_PASSWORD_RESET_TOKEN_TABLE', 'password_reset_tokens'),
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),

    'cookie_name' => env('AUTH_COOKIE_NAME', 'webino_auth_token'),

    'cookie_max_minutes' => (int) env('AUTH_COOKIE_MAX_MINUTES', 60 * 24 * 7),

    /*
    | Comma-separated user.role values that must enable TOTP 2FA.
    */
    /*
    | Empty by default so first-login works without a 2FA UI.
    | Set AUTH_ENFORCE_2FA_ROLES=admin once enrollment screens ship.
    */
    'enforce_2fa_roles' => env('AUTH_ENFORCE_2FA_ROLES', ''),

];
