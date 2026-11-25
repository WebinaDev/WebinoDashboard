<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Accounting\Treasury;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * The cash position and what is about to leave the bank.
 *
 * Three endpoints, because they answer three different questions a treasurer asks in order:
 * how much is in each account now, where did it go this month, and what is due next.
 */
class TreasuryController extends Controller
{
    public function __construct(private readonly Treasury $treasury) {}

    public function accounts(Request $request): JsonResponse
    {
        $rows = $this->treasury->accounts((int) $request->user()->tenant_id);

        return response()->json(['data' => [
            'accounts' => $rows,
            'total_minor' => round(array_sum(array_column($rows, 'balance_minor')), 2),
        ]]);
    }

    public function cashFlow(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $from = $request->filled('from')
            ? Carbon::parse((string) $request->input('from'))->startOfDay()
            : now()->startOfMonth();

        $to = $request->filled('to')
            ? Carbon::parse((string) $request->input('to'))->endOfDay()
            : now()->endOfDay();

        return response()->json(['data' => $this->treasury->cashFlow((int) $request->user()->tenant_id, $from, $to)]);
    }

    public function forecast(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->treasury->dueForecast(
            (int) $request->user()->tenant_id,
            (int) $request->integer('weeks', 6),
        )]);
    }
}
