<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Modules\Accounting\Services\BankReconciler;

/**
 * Bank reconciliation, reachable at last.
 *
 * The matching engine was written and never called: no route, no screen, no test. This is the
 * route. It takes a statement export and the window it covers, and returns what matched, what
 * did not, and — the figure that actually matters — the net difference between the two records.
 */
class BankReconciliationController extends Controller
{
    public function __construct(private readonly BankReconciler $reconciler) {}

    public function reconcile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cash_account_id' => ['required', 'integer'],
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            // The statement file's text. 4 MB of statement is a year at one branch.
            'content' => ['required', 'string', 'max:4000000'],
        ]);

        $tenantId = (int) $request->user()->tenant_id;

        $exists = \Illuminate\Support\Facades\DB::table('acc_cash_accounts')
            ->where('tenant_id', $tenantId)
            ->where('id', $data['cash_account_id'])
            ->exists();

        abort_if(! $exists, 404);

        $result = $this->reconciler->reconcile(
            $tenantId,
            (int) $data['cash_account_id'],
            Carbon::parse((string) $data['from'])->startOfDay(),
            Carbon::parse((string) $data['to'])->endOfDay(),
            (string) $data['content'],
        );

        return response()->json(['data' => $result]);
    }
}
