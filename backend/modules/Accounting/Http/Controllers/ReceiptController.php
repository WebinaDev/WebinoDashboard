<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccReceiptVoucher;
use Modules\Accounting\Services\LedgerPosting;

class ReceiptController extends Controller
{
    public function receipts(Request $request): JsonResponse
    {
        $q = AccReceiptVoucher::query()->with(['cashAccount', 'person'])->orderByDesc('id');
        if ($request->filled('status')) {
            $q->where('status', $request->input('status'));
        }

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 25), 100))]);
    }

    /**
     * Post a voucher to the ledger.
     *
     * This used to build the journal inline against codes 111 and 113 and always as a
     * receipt — so a supplier payment was posted as money *in*, and a tenant whose chart
     * numbered cash differently got a second cash account created behind their back.
     * {@see LedgerPosting} now owns the postings for every document in this module.
     */
    public function postReceipt(Request $request, int $id): JsonResponse
    {
        $voucher = AccReceiptVoucher::query()->findOrFail($id);

        $entry = app(LedgerPosting::class)->postVoucher($voucher);

        return response()->json([
            'data' => $voucher->fresh(['cashAccount', 'person', 'journalEntry']),
            'meta' => ['journal_entry_id' => $entry->id, 'document_no' => $entry->document_no],
        ]);
    }
}
