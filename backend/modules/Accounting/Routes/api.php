<?php

use Illuminate\Support\Facades\Route;
use Modules\Accounting\Http\Controllers\AccountingDashboardController;
use Modules\Accounting\Http\Controllers\AccountingSettingsController;
use Modules\Accounting\Http\Controllers\AccountingWpActionController;
use Modules\Accounting\Http\Controllers\AccInvoiceController;
use Modules\Accounting\Http\Controllers\CashAccountController;
use Modules\Accounting\Http\Controllers\ChartAccountController;
use Modules\Accounting\Http\Controllers\CheckController;
use Modules\Accounting\Http\Controllers\FinancialReportsController;
use Modules\Accounting\Http\Controllers\FiscalYearController;
use Modules\Accounting\Http\Controllers\JournalController;
use Modules\Accounting\Http\Controllers\LedgerController;
use Modules\Accounting\Http\Controllers\PersonController;
use Modules\Accounting\Http\Controllers\ProductController;
use Modules\Accounting\Http\Controllers\ReceiptController;
use Modules\Accounting\Http\Controllers\WarehouseAjaxParityController;
use Modules\Accounting\Http\Controllers\WarehouseReadController;

/*
|--------------------------------------------------------------------------
| API — /api/v1/accounting (parity with webinocrm-dashboard accounting pages)
|--------------------------------------------------------------------------
*/

Route::get('/summary', [AccountingDashboardController::class, 'summary']);
Route::get('/dashboard', [AccountingDashboardController::class, 'summary']);

Route::get('/fiscal-years', [FiscalYearController::class, 'index']);
Route::get('/journals', [JournalController::class, 'index']);

Route::get('/persons', [PersonController::class, 'index']);
Route::get('/products', [ProductController::class, 'index']);
Route::get('/invoices', [AccInvoiceController::class, 'invoices']);
Route::get('/cash-accounts', [CashAccountController::class, 'cashAccounts']);
Route::get('/receipts', [ReceiptController::class, 'receipts']);
Route::get('/checks', [CheckController::class, 'checks']);
Route::get('/chart', [ChartAccountController::class, 'chartOfAccounts']);
Route::post('/chart/seed', [ChartAccountController::class, 'seedChartIran']);
Route::post('/chart', [ChartAccountController::class, 'storeChartAccount']);
Route::patch('/chart/{id}', [ChartAccountController::class, 'updateChartAccount'])->whereNumber('id');
Route::delete('/chart/{id}', [ChartAccountController::class, 'destroyChartAccount'])->whereNumber('id');
Route::get('/user-defaults', [AccountingSettingsController::class, 'userDefaults']);
Route::put('/user-defaults', [AccountingSettingsController::class, 'userDefaultsPut']);
Route::get('/invoices/next-number', [AccInvoiceController::class, 'nextInvoiceNumber']);
Route::post('/invoices/{id}/confirm', [AccInvoiceController::class, 'confirmInvoice'])->whereNumber('id');
Route::post('/receipts/{id}/post', [ReceiptController::class, 'postReceipt'])->whereNumber('id');
Route::post('/checks/{id}/set-status', [CheckController::class, 'setCheckStatus'])->whereNumber('id');
Route::get('/ledger', [LedgerController::class, 'ledger']);
Route::get('/reports', [FinancialReportsController::class, 'financialReports']);
Route::get('/settings', [AccountingSettingsController::class, 'settings']);

Route::get('/warehouses', [WarehouseReadController::class, 'warehouses']);
Route::get('/warehouse-stock', [WarehouseReadController::class, 'warehouseStock']);
Route::get('/warehouse-inbound', [WarehouseReadController::class, 'warehouseInbound']);
Route::get('/warehouse-outbound', [WarehouseReadController::class, 'warehouseOutbound']);
Route::get('/warehouse-audit', [WarehouseReadController::class, 'warehouseAudit']);

/*
| WordPress admin-ajax parity: webinocrm_accounting_{action} → POST body JSON
*/
Route::post('/wp-action/{action}', [AccountingWpActionController::class, 'handle'])
    ->where('action', '[a-z0-9_]+');

Route::post('/warehouse-ajax/{action}', [WarehouseAjaxParityController::class, 'handle'])
    ->where('action', '[a-z_]+');
