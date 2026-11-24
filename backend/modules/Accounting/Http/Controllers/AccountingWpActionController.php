<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Services\AccountingWpActionService;

/**
 * Parity with WordPress admin-ajax actions: webinocrm_accounting_{action}
 * (see webinocrm includes/modules/accounting/ajax/class-accounting-ajax-handler.php).
 *
 * Client: POST /api/v1/accounting/wp-action/{action} with JSON body (former POST fields).
 */
class AccountingWpActionController extends Controller
{
    /** @var list<string> */
    private const ACTIONS = [
        'fiscal_years', 'fiscal_year_save', 'fiscal_year_delete',
        'chart_list', 'chart_save', 'chart_delete',
        'journal_list', 'journal_get', 'journal_save', 'journal_post', 'journal_delete',
        'ledger',
        'report_trial_balance', 'report_balance_sheet', 'report_profit_loss',
        'settings_get', 'settings_save', 'seed_chart',
        'person_categories', 'person_category_save', 'person_category_delete',
        'product_categories', 'product_category_save', 'product_category_delete',
        'units_list', 'unit_save', 'unit_delete',
        'price_lists', 'price_list_get', 'price_list_save', 'price_list_delete',
        'price_list_items', 'price_list_items_save',
        'persons_list', 'person_get', 'person_save', 'person_delete',
        'products_list', 'product_get', 'product_save', 'product_delete',
        'user_defaults_get', 'user_defaults_save',
        'invoice_list', 'invoice_get', 'invoice_save', 'invoice_delete',
        'invoice_next_number', 'invoice_confirm',
        'cash_accounts_list', 'cash_account_get', 'cash_account_save', 'cash_account_delete',
        'receipt_voucher_list', 'receipt_voucher_get', 'receipt_voucher_save',
        'receipt_voucher_post', 'receipt_voucher_delete', 'receipt_voucher_next_number',
        'check_list', 'check_get', 'check_save', 'check_delete', 'check_set_status',
    ];

    public function __construct(
        private readonly AccountingWpActionService $wpActions
    ) {}

    public function handle(Request $request, string $action): JsonResponse
    {
        if (! in_array($action, self::ACTIONS, true)) {
            return response()->json([
                'error' => [
                    'code' => 'UNKNOWN_ACCOUNTING_ACTION',
                    'message' => __('messages.unknown_webinocrm_accounting_action').$action,
                ],
            ], 404);
        }

        try {
            $data = $this->wpActions->handle($action, $request);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['message' => __('messages.validation_failed'), 'errors' => $e->errors()], 422);
        }

        return response()->json(['data' => $data]);
    }
}
