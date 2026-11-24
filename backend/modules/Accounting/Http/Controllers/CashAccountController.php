<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccCashAccount;

class CashAccountController extends Controller
{
    public function cashAccounts(Request $request): JsonResponse
    {
        $q = AccCashAccount::query()->orderBy('name');

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 50), 100))]);
    }
}
