<?php

use App\Http\Controllers\Api\V1\MarketplaceFeedController;
use App\Http\Controllers\Api\V1\MarketplaceWebhookController;
use Illuminate\Support\Facades\Route;

Route::middleware('public.module:marketplace')
    ->withoutMiddleware([
        \App\Http\Middleware\ThrottleApiToken::class,
        \App\Http\Middleware\AuthenticateFromCookie::class,
        \App\Http\Middleware\EnsureUserIsActive::class,
        \App\Http\Middleware\RequirePasswordChange::class,
        \App\Http\Middleware\RequireTwoFactor::class,
        \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
    ])
    ->group(function () {
        $feeds = [
            ['emalls', ['marketplace/emalls/products', 'wp-json/emalls_ext/v1/products'], ['GET', 'POST']],
            ['zarehbin', ['marketplace/zarehbin/products', 'wp-json/zarehbin/v1/products'], ['GET', 'POST']],
            ['snapppay', ['marketplace/snapppay-search/feed', 'wp-json/v1/product/feed'], ['GET', 'POST']],
            ['torobLegacy', ['marketplace/torob/products', 'wp-json/wcpe/v1/products'], ['GET', 'POST']],
            ['torobV3', ['marketplace/torob/v3/products', 'wp-json/torob_api/v3/products'], ['POST']],
            ['torobSetToken', ['marketplace/torob/set-token', 'wp-json/torob-api/v1/set-token'], ['POST']],
            ['torobOrderStatus', ['marketplace/torob/order-status', 'wp-json/torob-api/v1/order-status'], ['GET']],
            ['torobOrders', ['marketplace/torob/orders', 'wp-json/torob/v1/orders', 'wp-json/torob-api/v1/orders'], ['GET']],
            ['torobActions', ['marketplace/torob/actions', 'wp-json/torob/v1/actions'], ['GET']],
        ];
        foreach ($feeds as [$action, $paths, $methods]) {
            foreach ($paths as $path) {
                Route::match($methods, '/'.$path, [MarketplaceFeedController::class, $action])->middleware('throttle:120,1');
            }
        }

        Route::post('/marketplace/digikala/webhook', [MarketplaceWebhookController::class, 'digikala'])->middleware('throttle:300,1');
        foreach (['marketplace/basalam/webhook', 'wp-json/webino-basalam/v1/order-manager', 'wp-json/wnc-basalam/v1/order-manager', 'wp-json/sync-basalam/v1/order-manager'] as $path) {
            Route::post('/'.$path, [MarketplaceWebhookController::class, 'basalam'])->middleware('throttle:300,1');
        }
        foreach (['marketplace/basalam/plugin-status', 'wp-json/wnc-basalam/v1/plugin-status'] as $path) {
            Route::get('/'.$path, [MarketplaceWebhookController::class, 'basalamStatus'])->middleware('throttle:60,1');
        }
        Route::match(['GET', 'POST'], '/marketplace/basalam/oauth/callback', [MarketplaceWebhookController::class, 'basalamOAuthCallback']);
        Route::match(['GET', 'POST'], '/marketplace/basalam/pay/callback/{order}', [MarketplaceWebhookController::class, 'basalamPayCallback'])->whereNumber('order');
    });
