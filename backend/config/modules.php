<?php

return [

    'git' => [
        'enabled' => filter_var(env('MODULE_GIT_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
        'timeout' => (int) env('MODULE_GIT_TIMEOUT', 120),
        /** Ask CRM for PAT-injected clone URL (HMAC); requires WEBINO_BASE_URL + tenant license_key. */
        'crm_clone_auth' => filter_var(env('MODULE_GIT_CRM_AUTH', true), FILTER_VALIDATE_BOOLEAN),
        /** Hosts allowed for clone URLs (comma-separated). Empty = skip allowlist. */
        'allowed_hosts' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('MODULE_GIT_ALLOWED_HOSTS', ''))
        ))),
    ],

    'paths' => [
        'bundled' => env('MODULE_BUNDLED_PATH', 'modules'),
        'external' => env('MODULE_EXTERNAL_PATH', 'modules-external'),
        'frontend_external' => env('MODULE_FRONTEND_EXTERNAL_PATH', null),
    ],

];
