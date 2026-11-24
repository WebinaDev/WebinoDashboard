<?php

use Illuminate\Support\Facades\Route;
use Modules\Accounting\Http\Controllers\WebinocrmV1RestController;

/*
|--------------------------------------------------------------------------
| Compatibility routes for webinocrm-dashboard REST paths
| Full URL: /api/webinocrm/v1/...
| Mirrors paths like /wp-json/webinocrm/v1/warehouses
|--------------------------------------------------------------------------
*/

Route::get('/warehouses', [WebinocrmV1RestController::class, 'warehousesIndex']);
Route::post('/warehouses/create', [WebinocrmV1RestController::class, 'warehousesCreate']);
Route::post('/warehouses/update', [WebinocrmV1RestController::class, 'warehousesUpdate']);
Route::post('/warehouses/delete', [WebinocrmV1RestController::class, 'warehousesDelete']);

Route::get('/products', [WebinocrmV1RestController::class, 'productsIndex']);

Route::get('/warehouse/stock/{warehouseId}/{productId}', [WebinocrmV1RestController::class, 'warehouseStockByProduct'])
    ->whereNumber('warehouseId')
    ->whereNumber('productId');
Route::get('/warehouse/stock', [WebinocrmV1RestController::class, 'warehouseStock']);

Route::get('/warehouse/outbound', [WebinocrmV1RestController::class, 'outboundIndex']);
Route::post('/warehouse/outbound/create', [WebinocrmV1RestController::class, 'outboundCreate']);
Route::post('/warehouse/outbound/post', [WebinocrmV1RestController::class, 'outboundPost']);
Route::get('/warehouse/outbound/{id}', [WebinocrmV1RestController::class, 'outboundShow'])->whereNumber('id');

Route::get('/warehouse/inbound', [WebinocrmV1RestController::class, 'inboundIndex']);
Route::post('/warehouse/inbound/create', [WebinocrmV1RestController::class, 'inboundCreate']);
Route::post('/warehouse/inbound/post', [WebinocrmV1RestController::class, 'inboundPost']);
Route::get('/warehouse/inbound/{id}', [WebinocrmV1RestController::class, 'inboundShow'])->whereNumber('id');

Route::get('/warehouse/audit', [WebinocrmV1RestController::class, 'auditIndex']);
Route::post('/warehouse/audit/create', [WebinocrmV1RestController::class, 'auditCreate']);
Route::post('/warehouse/audit/record', [WebinocrmV1RestController::class, 'auditRecord']);
Route::post('/warehouse/audit/complete', [WebinocrmV1RestController::class, 'auditComplete']);
Route::post('/warehouse/audit/post', [WebinocrmV1RestController::class, 'auditPost']);
Route::get('/warehouse/audit/{id}', [WebinocrmV1RestController::class, 'auditShow'])->whereNumber('id');
