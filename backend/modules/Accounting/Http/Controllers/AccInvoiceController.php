<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Accounting\Entities\AccChartAccount;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccJournalLine;
use Modules\Accounting\Entities\AccountingInvoice;
use Modules\Accounting\Support\ExistsForTenant;

class AccInvoiceController extends Controller
{
    public function invoices(Request $request): JsonResponse
    {
        $q = AccountingInvoice::query()->with(['person', 'fiscalYear'])->orderByDesc('id');
        if ($request->filled('status')) {
            $q->where('status', $request->input('status'));
        }
        if ($request->filled('fiscal_year_id')) {
            $q->where('fiscal_year_id', $request->input('fiscal_year_id'));
        }

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 25), 100))]);
    }

    public function nextInvoiceNumber(Request $request): JsonResponse
    {
        $request->validate(['fiscal_year_id' => ['nullable', ExistsForTenant::in('acc_fiscal_years')]]);
        $q = AccountingInvoice::query()->orderByDesc('id');
        if ($request->filled('fiscal_year_id')) {
            $q->where('fiscal_year_id', $request->input('fiscal_year_id'));
        }
        $last = $q->value('number');
        $next = is_string($last) && preg_match('/(\d+)$/', $last, $m)
            ? preg_replace('/\d+$/', str_pad((string) ((int) $m[1] + 1), strlen($m[1]), '0', STR_PAD_LEFT), $last)
            : 'INV-'.Str::upper(Str::random(6));

        return response()->json(['data' => ['next_number' => $next]]);
    }

    public function confirmInvoice(Request $request, int $id): JsonResponse
    {
        $inv = AccountingInvoice::query()->findOrFail($id);
        if ($inv->status === 'posted') {
            return response()->json(['message' => __('messages.already_posted')], 422);
        }

        $ar = AccChartAccount::query()->where('code', '113')->where('is_postable', true)->first();
        $rev = AccChartAccount::query()->where('code', '401')->where('is_postable', true)->first();
        if (! $ar || ! $rev) {
            return response()->json(['message' => __('messages.chart_accounts_113_and_401_required_seed_chart')], 422);
        }

        $total = (float) $inv->total;
        DB::transaction(function () use ($inv, $ar, $rev, $total, $request) {
            $je = AccJournalEntry::query()->create([
                'fiscal_year_id' => $inv->fiscal_year_id,
                'document_no' => 'INV-'.$inv->id,
                'document_date' => $inv->document_date ?? now(),
                'description' => 'Invoice confirm #'.$inv->id,
                'status' => 'posted',
                'created_by' => $request->user()->id,
            ]);
            AccJournalLine::query()->create([
                'journal_entry_id' => $je->id,
                'account_id' => $ar->id,
                'debit' => $total,
                'credit' => 0,
                'description' => 'AR',
            ]);
            AccJournalLine::query()->create([
                'journal_entry_id' => $je->id,
                'account_id' => $rev->id,
                'debit' => 0,
                'credit' => $total,
                'description' => 'Revenue',
            ]);
            $inv->update(['status' => 'posted']);
        });

        return response()->json(['data' => $inv->fresh()]);
    }
}
