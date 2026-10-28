<?php

// Values previously read with env() at runtime; env() returns null once `php artisan optimize` caches config.
return [
    'tenant_seed_json' => env('TENANT_SEED_JSON'),
    'tenant_provision_token' => env('TENANT_PROVISION_TOKEN'),
    'tenant_product' => env('TENANT_PRODUCT', 'webinodashboard'),
    'api_rate_limit_per_minute' => (int) env('API_RATE_LIMIT_PER_MINUTE', 120),
    'openapi_public' => env('OPENAPI_PUBLIC') === null ? null : filter_var(env('OPENAPI_PUBLIC'), FILTER_VALIDATE_BOOLEAN),
    'sentry_dsn' => env('SENTRY_LARAVEL_DSN'),
    'elasticsearch_hosts' => env('ELASTICSEARCH_HOSTS'),
    'internal_api_secret' => (string) env('WEBINO_INTERNAL_API_SECRET', ''),
    'public_api_cache' => filter_var(env('PUBLIC_API_CACHE', true), FILTER_VALIDATE_BOOLEAN),
];
