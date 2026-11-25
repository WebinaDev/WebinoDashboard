<?php

use Illuminate\Support\Facades\Route;
use Modules\Accounting\Http\Controllers\AccInvoiceController;
use Modules\Accounting\Http\Controllers\AccountingDashboardController;
use Modules\Accounting\Http\Controllers\AccountingSettingsController;
use Modules\Accounting\Http\Controllers\AccountingWpActionController;
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
use Modules\Accounting\Http\Controllers\WarehouseController;
use Modules\Accounting\Http\Controllers\WarehouseReadController;

/*
|--------------------------------------------------------------------------
| API — /api/v1/erp-accounting (full double-entry ledger, acc_* tables)
|--------------------------------------------------------------------------
|
| REST surface: every resource has index/show/store/update/destroy. The
| WordPress-parity `wp-action/*` and `warehouse-ajax/*` endpoints below are kept
| for the ported dashboard pages, which mutate through them.
*/

Route::get('/summary', [AccountingDashboardController::class, 'summary']);
Route::get('/dashboard', [AccountingDashboardController::class, 'summary']);

// Fiscal years
Route::get('/fiscal-years', [FiscalYearController::class, 'index']);
Route::get('/fiscal-years/{id}', [FiscalYearController::class, 'show'])->whereNumber('id');
Route::post('/fiscal-years', [FiscalYearController::class, 'store']);
Route::patch('/fiscal-years/{id}', [FiscalYearController::class, 'update'])->whereNumber('id');
Route::delete('/fiscal-years/{id}', [FiscalYearController::class, 'destroy'])->whereNumber('id');

// Journals
Route::get('/journals', [JournalController::class, 'index']);
Route::get('/journals/{id}', [JournalController::class, 'show'])->whereNumber('id');
Route::post('/journals', [JournalController::class, 'store']);
Route::patch('/journals/{id}', [JournalController::class, 'update'])->whereNumber('id');
Route::post('/journals/{id}/post', [JournalController::class, 'post'])->whereNumber('id');
Route::delete('/journals/{id}', [JournalController::class, 'destroy'])->whereNumber('id');

// Persons
Route::get('/persons', [PersonController::class, 'index']);
Route::get('/persons/{id}', [PersonController::class, 'show'])->whereNumber('id');
Route::post('/persons', [PersonController::class, 'store']);
Route::patch('/persons/{id}', [PersonController::class, 'update'])->whereNumber('id');
Route::delete('/persons/{id}', [PersonController::class, 'destroy'])->whereNumber('id');

// Products
Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/{id}', [ProductController::class, 'show'])->whereNumber('id');
Route::post('/products', [ProductController::class, 'store']);
Route::patch('/products/{id}', [ProductController::class, 'update'])->whereNumber('id');
Route::delete('/products/{id}', [ProductController::class, 'destroy'])->whereNumber('id');

// Invoices
Route::get('/invoices', [AccInvoiceController::class, 'invoices']);
Route::get('/invoices/next-number', [AccInvoiceController::class, 'nextInvoiceNumber']);
Route::get('/invoices/{id}', [AccInvoiceController::class, 'show'])->whereNumber('id');
Route::post('/invoices', [AccInvoiceController::class, 'store']);
Route::patch('/invoices/{id}', [AccInvoiceController::class, 'update'])->whereNumber('id');
Route::delete('/invoices/{id}', [AccInvoiceController::class, 'destroy'])->whereNumber('id');
Route::post('/invoices/{id}/confirm', [AccInvoiceController::class, 'confirmInvoice'])->whereNumber('id');

// Cash accounts
Route::get('/cash-accounts', [CashAccountController::class, 'cashAccounts']);
Route::get('/cash-accounts/{id}', [CashAccountController::class, 'show'])->whereNumber('id');
Route::post('/cash-accounts', [CashAccountController::class, 'store']);
Route::patch('/cash-accounts/{id}', [CashAccountController::class, 'update'])->whereNumber('id');
Route::delete('/cash-accounts/{id}', [CashAccountController::class, 'destroy'])->whereNumber('id');

// Receipts
Route::get('/receipts', [ReceiptController::class, 'receipts']);
Route::get('/receipts/{id}', [ReceiptController::class, 'show'])->whereNumber('id');
Route::post('/receipts', [ReceiptController::class, 'store']);
Route::patch('/receipts/{id}', [ReceiptController::class, 'update'])->whereNumber('id');
Route::delete('/receipts/{id}', [ReceiptController::class, 'destroy'])->whereNumber('id');
Route::post('/receipts/{id}/post', [ReceiptController::class, 'postReceipt'])->whereNumber('id');

// Checks
Route::get('/checks', [CheckController::class, 'checks']);
Route::get('/checks/{id}', [CheckController::class, 'show'])->whereNumber('id');
Route::post('/checks', [CheckController::class, 'store']);
Route::patch('/checks/{id}', [CheckController::class, 'update'])->whereNumber('id');
Route::delete('/checks/{id}', [CheckController::class, 'destroy'])->whereNumber('id');
Route::post('/checks/{id}/set-status', [CheckController::class, 'setCheckStatus'])->whereNumber('id');

// Chart of accounts
Route::get('/chart', [ChartAccountController::class, 'chartOfAccounts']);
Route::post('/chart/seed', [ChartAccountController::class, 'seedChartIran']);
Route::post('/chart', [ChartAccountController::class, 'storeChartAccount']);
Route::patch('/chart/{id}', [ChartAccountController::class, 'updateChartAccount'])->whereNumber('id');
Route::delete('/chart/{id}', [ChartAccountController::class, 'destroyChartAccount'])->whereNumber('id');

// Settings + user defaults
Route::get('/settings', [AccountingSettingsController::class, 'settings']);
Route::put('/settings', [AccountingSettingsController::class, 'settingsUpdate']);
Route::get('/user-defaults', [AccountingSettingsController::class, 'userDefaults']);
Route::put('/user-defaults', [AccountingSettingsController::class, 'userDefaultsPut']);

// Ledger + reports
Route::get('/ledger', [LedgerController::class, 'ledger']);
Route::get('/reports', [FinancialReportsController::class, 'financialReports']);

// Warehouses (REST CRUD; document flows stay on warehouse-ajax below)
Route::get('/warehouses', [WarehouseController::class, 'index']);
Route::get('/warehouses/{id}', [WarehouseController::class, 'show'])->whereNumber('id');
Route::post('/warehouses', [WarehouseController::class, 'store']);
Route::patch('/warehouses/{id}', [WarehouseController::class, 'update'])->whereNumber('id');
Route::delete('/warehouses/{id}', [WarehouseController::class, 'destroy'])->whereNumber('id');
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
