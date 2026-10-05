<?php

/**
 * CORS origins come from CORS_ALLOWED_ORIGINS (comma-separated).
 * Default is empty (deny cross-origin) — never default to `*`, especially with
 * supports_credentials=true (browsers reject `*` + credentials anyway).
 *
 * Production example:
 *   CORS_ALLOWED_ORIGINS=https://shop.example.com,https://www.shop.example.com
 * Local example (see backend/.env.example):
 *   CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3080
 */
$origins = array_values(array_filter(array_map(
    'trim',
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))
)));

// Never allow wildcard with credentialed cookies.
$origins = array_values(array_filter($origins, static fn (string $o): bool => $o !== '*' && $o !== ''));

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $origins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
