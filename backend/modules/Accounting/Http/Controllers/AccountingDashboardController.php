<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Modules\Accounting\Entities\AccFiscalYear;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccPerson;
use Modules\Accounting\Entities\AccWarehouse;
use Modules\Accounting\Entities\AccountingInvoice;

class AccountingDashboardController extends Controller
{
    public function summary(): JsonResponse
    {
        return response()->json([
            'data' => [
                'fiscal_years_count' => AccFiscalYear::query()->count(),
                'journal_entries_count' => AccJournalEntry::query()->count(),
                'persons_count' => AccPerson::query()->count(),
                'invoices_count' => AccountingInvoice::query()->count(),
                'warehouses_count' => AccWarehouse::query()->count(),
            ],
        ]);
    }
}
