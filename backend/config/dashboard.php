<?php

return [

    'version' => env('DASHBOARD_VERSION', '0.0.0'),

    'self_update' => filter_var(env('DASHBOARD_SELF_UPDATE', false), FILTER_VALIDATE_BOOLEAN),

    'build_pipeline' => filter_var(env('DASHBOARD_BUILD_PIPELINE', false), FILTER_VALIDATE_BOOLEAN),

    'build_pipeline_timeout' => (int) env('DASHBOARD_BUILD_PIPELINE_TIMEOUT', 900),

];
