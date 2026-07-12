<?php

return [

    'git' => [
        'enabled' => filter_var(env('MODULE_GIT_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
        'timeout' => (int) env('MODULE_GIT_TIMEOUT', 120),
        /** Ask CRM for PAT-injected clone URL (HMAC); requires WEBINO_BASE_URL + tenant license_key. */
        'crm_clone_auth' => filter_var(env('MODULE_GIT_CRM_AUTH', false), FILTER_VALIDATE_BOOLEAN),
    ],

];
