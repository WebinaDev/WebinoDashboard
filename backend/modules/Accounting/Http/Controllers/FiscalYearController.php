<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Modules\Accounting\Entities\AccFiscalYear;

class FiscalYearController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => AccFiscalYear::query()->orderByDesc('starts_on')->get()]);
    }
}
