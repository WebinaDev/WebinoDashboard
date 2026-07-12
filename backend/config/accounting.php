<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Webino accounting module source (filesystem copy)
    |--------------------------------------------------------------------------
    |
    | Absolute path to the accounting module directory inside a Webino install,
    | e.g. /var/www/Webino/Plugins/Modules/Accounting
    |
    */
    'source_path' => env('WEBINO_ACCOUNTING_SOURCE_PATH'),

    /*
    | When true, install will copy the bundle even if CRM reports unlicensed.
    | Never enable in production.
    |
    */
    'allow_unlicensed_install' => (bool) env('ACCOUNTING_ALLOW_UNLICENSED_INSTALL', false),

];
