<?php

use Illuminate\Support\Facades\Route;
use Modules\Accounting\Http\Controllers\AccInvoiceController;
use Modules\Accounting\Http\Controllers\AccountingDashboardController;
use Modules\Accounting\Http\Controllers\AccountingSettingsController;
use Modules\Accounting\Http\Controllers\AccountingWpActionController;
use Modules\Accounting\Http\Controllers\BankReconciliationController;
use Modules\Accounting\Http\Controllers\CashAccountController;
use Modules\Accounting\Http\Controllers\ChartAccountController;
use Modules\Accounting\Http\Controllers\CheckController;
use Modules\Accounting\Http\Controllers\ExpenseController;
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
// The reconciliation engine had no caller for months. This is the caller.
Route::post('/cash-accounts/reconcile', [BankReconciliationController::class, 'reconcile']);
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
Route::post('/checks', [CheckController::class, 'store']);
Route::post('/checks/{id}/set-status', [CheckController::class, 'setCheckStatus'])->whereNumber('id');
Route::get('/ledger', [LedgerController::class, 'ledger']);

// Expenses, supplier bills and party credit: the three things that previously could only be
// expressed by hand-writing a journal.
Route::get('/expenses', [ExpenseController::class, 'index']);
Route::get('/expense-categories', [ExpenseController::class, 'categories']);
Route::post('/expenses', [ExpenseController::class, 'store']);
Route::get('/supplier-bills', [ExpenseController::class, 'bills']);
Route::post('/supplier-bills', [ExpenseController::class, 'storeBill']);
Route::post('/supplier-bills/{id}/pay', [ExpenseController::class, 'payBill'])->whereNumber('id');
Route::get('/parties', [ExpenseController::class, 'parties']);
Route::get('/parties/{id}/statement', [ExpenseController::class, 'statement'])->whereNumber('id');
Route::patch('/parties/{id}', [ExpenseController::class, 'updateParty'])->whereNumber('id');

// The oven and the espresso machine: bought, written down over their life, and eventually sold.
Route::get('/fixed-assets', [ExpenseController::class, 'assets']);
Route::post('/fixed-assets', [ExpenseController::class, 'storeAsset']);
Route::post('/fixed-assets/depreciate', [ExpenseController::class, 'depreciate']);
Route::post('/fixed-assets/{id}/dispose', [ExpenseController::class, 'disposeAsset'])->whereNumber('id');

// Treasury: where the money is now, where it went, and what is due out of the bank.
Route::get('/treasury/accounts', [\App\Http\Controllers\Api\V1\TreasuryController::class, 'accounts']);
Route::get('/treasury/cash-flow', [\App\Http\Controllers\Api\V1\TreasuryController::class, 'cashFlow']);
Route::get('/treasury/forecast', [\App\Http\Controllers\Api\V1\TreasuryController::class, 'forecast']);

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
