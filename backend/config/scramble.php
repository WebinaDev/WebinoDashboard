<?php

use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;

return [
    'api_path' => 'api/v1',
    'api_domain' => null,
    'export_path' => 'storage/app/openapi.json',
    'middleware' => [],
    'extensions' => [],
    'servers' => null,
    'info' => [
        'version' => '1.0.0',
        'description' => 'WebinoDashboard multi-tenant customer platform API',
    ],
];
