<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'webino' => [
        'base_url' => env('WEBINO_BASE_URL', 'http://localhost'),
        'license_hmac_secret' => env('WEBINOCRM_LICENSE_HMAC_SECRET'),
        'provision_hmac_secret' => env('WEBINO_PROVISION_HMAC_SECRET'),
    ],

    'zarinpal' => [
        'merchant_id' => env('ZARINPAL_MERCHANT_ID', ''),
        'sandbox' => filter_var(env('ZARINPAL_SANDBOX', true), FILTER_VALIDATE_BOOLEAN),
    ],

    'digipay' => [
        'base_url' => env('DIGIPAY_BASE_URL', 'https://uat.mydigipay.info/digipay/api'),
        'username' => env('DIGIPAY_USERNAME', ''),
        'password' => env('DIGIPAY_PASSWORD', ''),
        'client_id' => env('DIGIPAY_CLIENT_ID', ''),
        'client_secret' => env('DIGIPAY_CLIENT_SECRET', ''),
        'provider_id' => env('DIGIPAY_PROVIDER_ID'),
        'cell_number' => env('DIGIPAY_CELL_NUMBER', ''),
        'preferred_gateway' => env('DIGIPAY_PREFERRED_GATEWAY', 0),
    ],

];
