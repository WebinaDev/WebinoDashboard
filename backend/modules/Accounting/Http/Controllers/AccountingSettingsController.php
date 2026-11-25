<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Accounting\Entities\AccountingSetting;
use Modules\Accounting\Entities\AccUserDefault;
use Modules\Accounting\Support\AccountingMoney;

class AccountingSettingsController extends Controller
{
    public function settings(): JsonResponse
    {
        $money = AccountingMoney::settingsPayload();
        $fyId = AccountingSetting::get('accounting_default_fiscal_year_id');

        return response()->json([
            'data' => array_merge($money, [
                'fiscal_year_id' => $fyId ? (int) $fyId : null,
            ]),
        ]);
    }

    public function userDefaults(Request $request): JsonResponse
    {
        $uid = $request->user()->id;
        $row = AccUserDefault::query()->firstOrCreate(['user_id' => $uid]);

        return response()->json(['data' => $row]);
    }

    public function userDefaultsPut(Request $request): JsonResponse
    {
        $uid = $request->user()->id;
        $tenantId = (int) $request->user()->tenant_id;

        // `exists:` is a query-builder rule and does not pick up the model's global
        // scope, so a bare `exists:acc_fiscal_years,id` would accept another tenant's id
        // and store it here. Each rule below therefore pins tenant_id explicitly.
        $data = $request->validate([
            'fiscal_year_id' => ['nullable', 'integer', Rule::exists('acc_fiscal_years', 'id')->where('tenant_id', $tenantId)],
            'cash_account_id' => ['nullable', 'integer', Rule::exists('acc_cash_accounts', 'id')->where('tenant_id', $tenantId)],
            'warehouse_id' => ['nullable', 'integer', Rule::exists('acc_warehouses', 'id')->where('tenant_id', $tenantId)],
            'price_list_id' => ['nullable', 'integer', Rule::exists('acc_price_lists', 'id')->where('tenant_id', $tenantId)],
            'tax_rate' => 'nullable|numeric|min:0|max:100',
        ]);

        $row = AccUserDefault::query()->updateOrCreate(['user_id' => $uid], $data);

        return response()->json(['data' => $row]);
    }
}
