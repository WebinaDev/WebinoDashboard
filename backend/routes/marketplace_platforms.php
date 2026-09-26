<?php

use App\Http\Controllers\Api\V1\MarketplaceBasalamController;
use App\Http\Controllers\Api\V1\MarketplaceDigikalaController;
use App\Http\Controllers\Api\V1\MarketplaceTorobController;
use Illuminate\Support\Facades\Route;

Route::prefix('digikala')->group(function () {
    Route::get('/overview', [MarketplaceDigikalaController::class, 'overview']);
    Route::post('/keys/generate', [MarketplaceDigikalaController::class, 'generateKeys']);
    Route::post('/token/issue', [MarketplaceDigikalaController::class, 'issueToken']);
    Route::post('/token/refresh', [MarketplaceDigikalaController::class, 'refreshToken']);
    Route::post('/disconnect', [MarketplaceDigikalaController::class, 'disconnect']);
    Route::get('/scopes', [MarketplaceDigikalaController::class, 'scopes']);
    Route::put('/webhook-events', [MarketplaceDigikalaController::class, 'saveWebhookEvents']);
    Route::post('/webhook/subscribe', [MarketplaceDigikalaController::class, 'subscribe']);
    Route::get('/health', [MarketplaceDigikalaController::class, 'health']);
    Route::post('/jobs/{action}', [MarketplaceDigikalaController::class, 'queue'])->where('action', 'import|auto-link|reconcile');
    Route::get('/products/{product}/dkp-variants', [MarketplaceDigikalaController::class, 'dkpVariants'])->whereNumber('product');
    Route::post('/products/{product}/map', [MarketplaceDigikalaController::class, 'mapDkp'])->whereNumber('product');
    Route::get('/products/{product}/labels', [MarketplaceDigikalaController::class, 'labels'])->whereNumber('product');
    Route::get('/orders/{order}', [MarketplaceDigikalaController::class, 'orderInfo'])->whereNumber('order');
    Route::post('/orders/{order}/sbs-status', [MarketplaceDigikalaController::class, 'sbsStatus'])->whereNumber('order');
    Route::post('/orders/{order}/cancel', [MarketplaceDigikalaController::class, 'cancel'])->whereNumber('order');
});

Route::prefix('basalam')->controller(MarketplaceBasalamController::class)->group(function () {
    Route::get('/status', 'status');
    Route::get('/coverage/endpoints', 'coverage');
    Route::get('/settings', 'settings');
    Route::post('/settings', 'saveSettings');
    Route::get('/gateway/settings', 'gatewaySettings');
    Route::post('/gateway/settings', 'saveGatewaySettings');

    Route::post('/oauth/start', 'oauthStart');
    Route::post('/oauth/complete', 'oauthComplete');
    Route::post('/oauth/manual', 'oauthManual');
    Route::post('/oauth/refresh', 'oauthRefresh');
    Route::post('/oauth/disconnect', 'oauthDisconnect');

    Route::get('/vendor', 'vendor');
    Route::post('/vendor', 'saveVendor');
    Route::get('/shipping', 'shipping');
    Route::post('/shipping', 'shippingAction');
    Route::get('/discounts', 'discounts');
    Route::post('/discounts', 'createDiscount');
    Route::post('/discounts/tasks', 'discountTasks');
    Route::get('/chat/token', 'chatToken');
    Route::post('/chat/notify', 'chatNotify');
    Route::post('/chat/alert/dismiss', 'dismissChatAlert');

    Route::get('/webhooks', 'webhooks');
    Route::post('/webhooks/rotate', 'webhookRotate');
    Route::post('/webhooks/delete', 'webhookDelete');
    Route::post('/webhook/setup', 'webhookSetup');

    Route::get('/jobs', 'jobs');
    Route::post('/jobs/cancel', 'cancelJobs');
    Route::get('/logs', 'logs');
    Route::get('/health', 'health');
    Route::post('/circuit/reset', 'resetCircuit');

    Route::get('/products', 'productsList');
    Route::get('/products/remote', 'remoteSearch');
    Route::get('/products/duplicates', 'duplicates');
    Route::post('/products/duplicates/repair', 'repairDuplicates');
    Route::get('/products/{product}', 'productInfo')->whereNumber('product');
    Route::put('/products/{product}/meta', 'saveProductMeta')->whereNumber('product');
    Route::post('/sync/products/create-all', 'productsCreateAll');
    Route::post('/sync/products/update-all', 'productsUpdateAll');
    Route::post('/sync/products/connect-all', 'productsConnectAll');
    Route::post('/sync/products/sync-now', 'productsSyncNow');
    Route::post('/sync/products/create', 'productCreate');
    Route::post('/sync/products/update', 'productUpdate');
    Route::post('/sync/products/archive', 'productArchive');
    Route::post('/sync/products/restore', 'productRestore');
    Route::post('/sync/products/disconnect', 'productDisconnect');
    Route::post('/sync/products/connect', 'productConnect');

    Route::get('/commission', 'commission');
    Route::post('/commission', 'commissionImport');

    Route::get('/categories', 'categories');
    Route::post('/categories/detect', 'categoriesDetect');
    Route::get('/categories/attributes', 'categoryAttributes');
    Route::get('/categories/option-maps', 'optionMaps');
    Route::post('/categories/option-maps', 'saveOptionMap');
    Route::post('/categories/option-maps/delete', 'deleteOptionMap');
    Route::get('/categories/mappings', 'mappings');
    Route::post('/categories/mappings', 'saveMapping');
    Route::post('/categories/mappings/delete', 'deleteMapping');

    Route::get('/orders', 'ordersList');
    Route::post('/sync/orders/pull', 'ordersPull');
    Route::post('/reconcile', 'ordersPull');
    Route::get('/orders/{order}', 'orderInfo')->whereNumber('order');
    Route::post('/orders/{order}/confirm', 'orderConfirm')->whereNumber('order');
    Route::post('/orders/{order}/cancel', 'orderCancel')->whereNumber('order');
    Route::post('/orders/{order}/cancel-request', 'orderCancelRequest')->whereNumber('order');
    Route::post('/orders/{order}/delay', 'orderDelay')->whereNumber('order');
    Route::post('/orders/{order}/tracking', 'orderTracking')->whereNumber('order');
    Route::post('/orders/{order}/resync', 'orderResync')->whereNumber('order');

    Route::get('/finance/balance', 'financeBalance');
    Route::get('/finance/banks', 'financeBanks');
    Route::post('/finance/settlement', 'financeSettlement');
    Route::get('/tickets', 'tickets');
});

Route::get('/torob/queue', [MarketplaceTorobController::class, 'queue']);
Route::post('/torob/queue/flush', [MarketplaceTorobController::class, 'flush']);
Route::post('/torob/reset-token', [MarketplaceTorobController::class, 'resetToken']);
Route::get('/torob/preview', [MarketplaceTorobController::class, 'preview']);
Route::get('/torob/orders/{order}', [MarketplaceTorobController::class, 'orderInfo'])->whereNumber('order');
Route::put('/torob/orders/{order}', [MarketplaceTorobController::class, 'saveOrderInfo'])->whereNumber('order');
