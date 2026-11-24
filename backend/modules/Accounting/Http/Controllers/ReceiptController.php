<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\AccChartAccount;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccJournalLine;
use Modules\Accounting\Entities\AccReceiptVoucher;

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

    public function postReceipt(Request $request, int $id): JsonResponse
    {
        $r = AccReceiptVoucher::query()->findOrFail($id);
        if ($r->status === 'posted') {
            return response()->json(['message' => __('messages.already_posted')], 422);
        }
        $cash = AccChartAccount::query()->where('code', '111')->where('is_postable', true)->first();
        $ar = AccChartAccount::query()->where('code', '113')->where('is_postable', true)->first();
        if (! $cash || ! $ar) {
            return response()->json(['message' => __('messages.chart_accounts_111_and_113_required')], 422);
        }
        $amt = (float) $r->amount;
        DB::transaction(function () use ($r, $cash, $ar, $amt, $request) {
            $je = AccJournalEntry::query()->create([
                'fiscal_year_id' => $r->fiscal_year_id,
                'document_no' => 'RC-'.$r->id,
                'document_date' => $r->document_date ?? now(),
                'description' => 'Receipt '.$r->number,
                'status' => 'posted',
                'created_by' => $request->user()->id,
            ]);
            AccJournalLine::query()->create([
                'journal_entry_id' => $je->id,
                'account_id' => $cash->id,
                'debit' => $amt,
                'credit' => 0,
                'description' => 'Cash',
            ]);
            AccJournalLine::query()->create([
                'journal_entry_id' => $je->id,
                'account_id' => $ar->id,
                'debit' => 0,
                'credit' => $amt,
                'description' => 'AR',
            ]);
            $r->update(['status' => 'posted']);
        });

        return response()->json(['data' => $r->fresh()]);
    }
}
