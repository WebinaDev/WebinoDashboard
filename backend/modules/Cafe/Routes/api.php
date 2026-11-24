<?php

use Illuminate\Support\Facades\Route;
use Modules\Cafe\Http\Controllers\BranchOperationsController;
use Modules\Cafe\Http\Controllers\CafeBranchController;
use Modules\Cafe\Http\Controllers\CafeDeliveryController;
use Modules\Cafe\Http\Controllers\CafeEngagementInboxController;
use Modules\Cafe\Http\Controllers\CafeFloorController;
use Modules\Cafe\Http\Controllers\CafeKitchenController;
use Modules\Cafe\Http\Controllers\CafeManagerController;
use Modules\Cafe\Http\Controllers\CafeOperationsController;
use Modules\Cafe\Http\Controllers\CafePosController;
use Modules\Cafe\Http\Controllers\CafePriceCalculatorController;
use Modules\Cafe\Http\Controllers\CafeQrController;
use Modules\Cafe\Http\Controllers\CafeSettingsController;
use Modules\Cafe\Http\Controllers\CafeShiftController;
use Modules\Cafe\Http\Controllers\CafeTableController;

/*
|--------------------------------------------------------------------------
| Cafe admin + public API — mounted at /api/v1/cafe
|--------------------------------------------------------------------------
|
| These groups used to live inline in routes/api.php. They are unchanged here:
| the same middleware, the same capability strings, the same paths (relative,
| because the provider applies the `v1/cafe` prefix). Moving them into the
| module is what lets the module be installed, disabled, or replaced on its
| own, the way Accounting already is.
|
| Public (guest) routes are registered by the provider separately because
| they carry `public.module:cafe` and `public.tenant` instead of `auth:sanctum`.
|
*/

            Route::middleware(['module:cafe_menu', 'can:catalog.*,commerce.*'])->group(function () {
                Route::get('/menu-settings', [CafeSettingsController::class, 'showMenu']);
                Route::patch('/menu-settings', [CafeSettingsController::class, 'updateMenu']);
                Route::post('/bulk-price', [CafeSettingsController::class, 'bulkPrice']);
                // «پیشنهاد قیمت آیتم‌ها»: live calculation, saved cost sheets, applying a price.
                Route::get('/pricing', [CafePriceCalculatorController::class, 'index']);
                Route::post('/pricing/calculate', [CafePriceCalculatorController::class, 'calculate']);
                Route::post('/pricing/allocate', [CafePriceCalculatorController::class, 'allocate']);
                Route::post('/pricing/reverse', [CafePriceCalculatorController::class, 'reverse']);
                Route::post('/pricing', [CafePriceCalculatorController::class, 'store']);
                Route::delete('/pricing/{sheet}', [CafePriceCalculatorController::class, 'destroy'])->whereNumber('sheet');
                Route::get('/engagement-settings', [CafeSettingsController::class, 'showEngagement']);
                Route::patch('/engagement-settings', [CafeSettingsController::class, 'updateEngagement']);
                Route::get('/feedback', [CafeEngagementInboxController::class, 'feedback']);
                Route::get('/likes', [CafeEngagementInboxController::class, 'likes']);
            });

            Route::middleware(['module:cafe_menu', 'can:pos.use,orders.*,reports.shop,accounting.manage'])->group(function () {
                Route::get('/pos/shift', [CafeShiftController::class, 'current']);
                Route::get('/pos/shifts', [CafeShiftController::class, 'index']);
                Route::get('/pos/shifts/{shift}', [CafeShiftController::class, 'show'])->whereNumber('shift');
                Route::get('/pos/shifts/{shift}/movements', [CafeShiftController::class, 'movements'])->whereNumber('shift');
            });
            Route::middleware(['module:cafe_menu', 'can:pos.use,orders.*'])->group(function () {
                Route::post('/pos/shift/open', [CafeShiftController::class, 'open']);
                Route::post('/pos/shifts/{shift}/close', [CafeShiftController::class, 'close'])->whereNumber('shift');
                Route::post('/pos/shifts/{shift}/movements', [CafeShiftController::class, 'storeMovement'])->whereNumber('shift');
            });

            Route::middleware(['module:cafe_qr', 'can:catalog.*,commerce.*'])->group(function () {
                Route::get('/qr-settings', [CafeQrController::class, 'showSettings']);
                Route::patch('/qr-settings', [CafeQrController::class, 'updateSettings']);
                Route::get('/qr', [CafeQrController::class, 'menuQr']);

                Route::get('/tables', [CafeTableController::class, 'index']);
                Route::post('/tables', [CafeTableController::class, 'store']);
                Route::patch('/tables/{table}', [CafeTableController::class, 'update'])->whereNumber('table');
                Route::delete('/tables/{table}', [CafeTableController::class, 'destroy'])->whereNumber('table');
            });

            // Multi-branch operations. Reading stock and settings is open to anyone who can
            // run the floor; changing them needs the branch-management capability.
            Route::middleware(['module:cafe_menu', 'can:branches.manage,catalog.*'])->group(function () {
                Route::apiResource('branches', CafeBranchController::class)->only(['index', 'store', 'update', 'destroy']);
                // Multi-branch switchboard, per-branch stock, price overrides.
                Route::get('/branch-settings', [BranchOperationsController::class, 'settingsShow']);
                Route::put('/branch-settings', [BranchOperationsController::class, 'settingsUpdate']);
                Route::get('/branch-stock', [BranchOperationsController::class, 'stockIndex']);
                Route::post('/branch-stock/count', [BranchOperationsController::class, 'stockCount']);
                Route::get('/branch-prices', [BranchOperationsController::class, 'priceOverrideIndex']);
                Route::post('/branch-prices', [BranchOperationsController::class, 'priceOverride']);
                Route::delete('/branch-prices/{override}', [BranchOperationsController::class, 'priceOverrideDestroy'])->whereNumber('override');
                Route::get('/oversold-orders', [BranchOperationsController::class, 'oversoldIndex']);

                // Kitchen stations: routing, membership, and the per-station KDS board.
                Route::get('/stations', [BranchOperationsController::class, 'stationsIndex']);
                Route::post('/stations', [BranchOperationsController::class, 'stationsStore']);
                Route::patch('/stations/{station}', [BranchOperationsController::class, 'stationsUpdate'])->whereNumber('station');
                Route::delete('/stations/{station}', [BranchOperationsController::class, 'stationsDestroy'])->whereNumber('station');
                Route::post('/stations/{station}/assign', [BranchOperationsController::class, 'stationsAssign'])->whereNumber('station');
                Route::delete('/stations/{station}/users/{user}', [BranchOperationsController::class, 'stationsUnassignUser'])->whereNumber('station')->whereNumber('user');
            });

            // The kitchen board is its own access path. A cook holds kitchen.view and
            // nothing else, so it cannot live inside the catalog.* menu-management group.
            Route::middleware(['module:cafe_menu', 'can:kitchen.view,kitchen.station,catalog.*,reports.shop,orders.*'])->group(function () {
                Route::get('/kitchen-orders', [CafeKitchenController::class, 'index']);
                Route::get('/kitchen-orders/live', [CafeKitchenController::class, 'live']);
                Route::patch('/kitchen-orders/{order}', [CafeKitchenController::class, 'update'])->whereNumber('order');
            });

            // Daily operations: workbench queue + live floor map. A cashier, waiter and cook
            // all open this page; the role filter decides which lanes they see.
            Route::middleware(['module:cafe_menu', 'can:pos.use,orders.create,orders.floor,kitchen.view,catalog.*'])->group(function () {
                Route::get('/workbench', [CafeOperationsController::class, 'workbench']);
            });

            // The till: one bootstrap call for the whole screen, then order entry. A waiter
            // holds `orders.create` but no `pos.use`, so both grants open these.
            Route::middleware(['module:cafe_menu', 'can:pos.use,orders.create,catalog.*'])->group(function () {
                Route::get('/pos/bootstrap', [CafePosController::class, 'bootstrap']);
                Route::get('/pos/guests', [CafePosController::class, 'guests']);
                Route::post('/pos/quote', [CafePosController::class, 'quote']);
                Route::post('/pos/orders', [CafePosController::class, 'store']);
                Route::get('/pos/orders/{order}', [CafePosController::class, 'show'])->whereNumber('order');
                Route::put('/pos/orders/{order}', [CafePosController::class, 'update'])->whereNumber('order');
            });

            // Split payment, void-with-reason, per-line KDS ticks.
            Route::middleware(['module:cafe_menu', 'can:pos.use,orders.create,catalog.*'])->group(function () {
                Route::middleware('can:pos.use,orders.void,catalog.*')->group(function () {
                    Route::post('/orders/{order}/settle', [CafeOperationsController::class, 'settle'])->whereNumber('order');
                });
                Route::post('/orders/{order}/cancel', [CafeOperationsController::class, 'cancel'])->whereNumber('order');
            });

            Route::middleware(['module:cafe_menu', 'can:kitchen.view,kitchen.station,catalog.*,pos.use'])->group(function () {
                Route::get('/orders/{order}/prep', [CafeOperationsController::class, 'orderPrep'])->whereNumber('order');
                Route::post('/orders/{order}/prep', [CafeOperationsController::class, 'itemPrep'])->whereNumber('order');
                // The board's columns: read by every cook, edited by whoever manages stations.
                Route::get('/kitchen-columns', [CafeOperationsController::class, 'kitchenColumns']);
            });

            Route::middleware(['module:cafe_menu', 'can:kitchen.station,catalog.*'])->group(function () {
                Route::put('/kitchen-columns', [CafeOperationsController::class, 'kitchenColumnsUpdate']);
            });

            // Delivery areas carry money (a fee and a minimum), so they sit with the branch
            // managers rather than with every till.
            Route::middleware(['module:cafe_menu', 'can:branches.manage,catalog.*'])->group(function () {
                Route::get('/delivery-zones', [CafeOperationsController::class, 'zonesIndex']);
                Route::post('/delivery-zones', [CafeOperationsController::class, 'zonesStore']);
                Route::patch('/delivery-zones/{zone}', [CafeOperationsController::class, 'zonesUpdate'])->whereNumber('zone');
                Route::delete('/delivery-zones/{zone}', [CafeOperationsController::class, 'zonesDestroy'])->whereNumber('zone');
            });
            Route::middleware(['module:cafe_menu', 'can:pos.use,orders.create,orders.*'])->group(function () {
                Route::get('/delivery-quote', [CafeOperationsController::class, 'zonesQuote']);
            });

            // Amending a paid invoice: request is open to the till, approval is not.
            Route::middleware(['module:cafe_menu', 'can:pos.use,orders.*'])->group(function () {
                Route::get('/orders/{order}/amendments', [CafeOperationsController::class, 'amendmentsIndex'])->whereNumber('order');
                Route::post('/orders/{order}/amendments', [CafeOperationsController::class, 'amendmentRequest'])->whereNumber('order');
            });
            Route::middleware(['module:cafe_menu', 'can:accounting.approve,pos.approve,accounting.manage'])->group(function () {
                // The approval queue: whoever may approve is exactly who needs to see it, and a
                // cashier who may only *request* must not see other people's pending edits.
                Route::get('/amendments/pending', [CafeOperationsController::class, 'amendmentsPending']);
                Route::post('/amendments/{amendment}/approve', [CafeOperationsController::class, 'amendmentApprove'])->whereNumber('amendment');
                Route::post('/amendments/{amendment}/reject', [CafeOperationsController::class, 'amendmentReject'])->whereNumber('amendment');
                Route::post('/amendments/{amendment}/settle', [CafeOperationsController::class, 'amendmentSettle'])->whereNumber('amendment');
            });

            // Operational thresholds shared by the workbench, KDS and delivery.
            Route::middleware(['module:cafe_menu', 'can:settings.manage,catalog.*'])->group(function () {
                Route::get('/operations-settings', [CafeOperationsController::class, 'settingsShow']);
                Route::put('/operations-settings', [CafeOperationsController::class, 'settingsUpdate']);
            });

            // --- POS operations -------------------------------------------------
            // Waiter floor board, courier run sheet, and the manager KPI rollup each carry
            // their own gate. They must not inherit the catalog/commerce requirement of the
            // tables CRUD above: a waiter or driver holds orders.own, not catalog.*.
            Route::middleware(['module:cafe_menu', 'can:orders.own,orders.*,catalog.*,pos.use'])->group(function () {
                Route::get('/floor', [CafeFloorController::class, 'index']);
                Route::patch('/floor/{table}', [CafeFloorController::class, 'updateStatus'])->whereNumber('table');
                Route::post('/floor/{table}/free', [CafeFloorController::class, 'free'])->whereNumber('table');
            });

            Route::middleware(['module:cafe_menu', 'can:orders.own,orders.*'])->group(function () {
                Route::get('/deliveries', [CafeDeliveryController::class, 'index']);
                Route::post('/deliveries/{order}/claim', [CafeDeliveryController::class, 'claim'])->whereNumber('order');
                Route::post('/deliveries/{order}/pick-up', [CafeDeliveryController::class, 'pickUp'])->whereNumber('order');
                Route::post('/deliveries/{order}/deliver', [CafeDeliveryController::class, 'deliver'])->whereNumber('order');
                Route::post('/deliveries/{order}/fail', [CafeDeliveryController::class, 'fail'])->whereNumber('order');
                Route::post('/deliveries/{order}/release', [CafeDeliveryController::class, 'release'])->whereNumber('order');
            });

            Route::middleware(['module:cafe_menu', 'can:reports.shop,reports.*,orders.*'])->group(function () {
                Route::get('/manager/overview', [CafeManagerController::class, 'overview']);
                // The same board as a spreadsheet, for comparing weeks in Excel and for printing.
                Route::get('/manager/export', [CafeManagerController::class, 'export']);
            });

            Route::middleware(['module:cafe_reservations', 'can:catalog.*,commerce.*'])->group(function () {
                Route::get('/reservations', [ReservationController::class, 'index']);
                Route::patch('/reservations/{reservation}', [ReservationController::class, 'updateReservation'])->whereNumber('reservation');
                Route::post('/events', [ReservationController::class, 'storeEvent']);
                Route::patch('/events/{event}', [ReservationController::class, 'updateEvent'])->whereNumber('event');
                Route::patch('/event-bookings/{booking}', [ReservationController::class, 'updateEventBooking'])->whereNumber('booking');
            });

            Route::middleware(['module:cafe_hours', 'can:catalog.*,commerce.*'])->group(function () {
                Route::get('/hours-settings', [CafeSettingsController::class, 'showHours']);
                Route::patch('/hours-settings', [CafeSettingsController::class, 'updateHours']);
            });

            Route::middleware(['module:cafe_gallery', 'can:catalog.*,commerce.*'])->group(function () {
                Route::get('/gallery-settings', [CafeSettingsController::class, 'showGallery']);
                Route::patch('/gallery-settings', [CafeSettingsController::class, 'updateGallery']);
            });

            Route::middleware(['module:cafe_venue', 'can:catalog.*,commerce.*'])->group(function () {
                Route::get('/venue-settings', [CafeSettingsController::class, 'showVenue']);
                Route::patch('/venue-settings', [CafeSettingsController::class, 'updateVenue']);
            });
