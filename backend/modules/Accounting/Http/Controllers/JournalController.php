<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccJournalLine;
use Modules\Accounting\Support\AppliesIndexQuery;
use Modules\Accounting\Support\ExistsForTenant;

class JournalController extends Controller
{
    use AppliesIndexQuery;

    public function index(Request $request): JsonResponse
    {
        $query = AccJournalEntry::query()->with('lines');

        if ($request->filled('fiscal_year_id')) {
            $query->where('fiscal_year_id', $request->input('fiscal_year_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('from')) {
            $query->whereDate('document_date', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('document_date', '<=', $request->input('to'));
        }

        $paginator = $this->applyIndexQuery(
            $query,
            $request,
            [],
            ['document_no', 'description'],
            ['document_date', 'created_at'],
            'document_date',
            'desc',
        );

        return $this->paginatedJsonResponse($paginator);
    }

    public function show(int $id): JsonResponse
    {
        $entry = AccJournalEntry::query()->with('lines.account')->findOrFail($id);

        return response()->json(['data' => $entry]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateJournal($request);

        $entry = DB::transaction(function () use ($data, $request) {
            $entry = AccJournalEntry::query()->create([
                'fiscal_year_id' => $data['fiscal_year_id'] ?? null,
                'document_no' => $data['document_no'] ?? null,
                'document_date' => $data['document_date'],
                'description' => $data['description'] ?? null,
                'status' => 'draft',
                'created_by' => $request->user()->id,
            ]);

            $this->writeLines($entry, $data['lines']);

            return $entry;
        });

        return response()->json(['data' => $entry->fresh('lines')], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $entry = AccJournalEntry::query()->findOrFail($id);

        if ($entry->status === 'posted') {
            return response()->json(['message' => __('messages.posted_journal_is_immutable')], 422);
        }

        $data = $this->validateJournal($request);

        DB::transaction(function () use ($entry, $data) {
            $entry->update([
                'fiscal_year_id' => $data['fiscal_year_id'] ?? $entry->fiscal_year_id,
                'document_no' => $data['document_no'] ?? $entry->document_no,
                'document_date' => $data['document_date'],
                'description' => $data['description'] ?? $entry->description,
            ]);

            AccJournalLine::query()->where('journal_entry_id', $entry->id)->delete();
            $this->writeLines($entry, $data['lines']);
        });

        return response()->json(['data' => $entry->fresh('lines')]);
    }

    public function post(Request $request, int $id): JsonResponse
    {
        $entry = AccJournalEntry::query()->with('lines')->findOrFail($id);

        if ($entry->status === 'posted') {
            return response()->json(['message' => __('messages.already_posted')], 422);
        }

        $debit = (float) $entry->lines->sum('debit');
        $credit = (float) $entry->lines->sum('credit');

        if ($entry->lines->isEmpty() || abs($debit - $credit) >= 0.01 || $debit <= 0) {
            return response()->json(['message' => __('messages.journal_must_be_balanced')], 422);
        }

        $entry->update(['status' => 'posted']);

        return response()->json(['data' => $entry->fresh('lines')]);
    }

    public function destroy(int $id): JsonResponse
    {
        $entry = AccJournalEntry::query()->findOrFail($id);

        if ($entry->status === 'posted') {
            return response()->json(['message' => __('messages.posted_journal_is_immutable')], 422);
        }

        $entry->delete();

        return response()->json([], 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateJournal(Request $request): array
    {
        $data = $request->validate([
            'fiscal_year_id' => ['nullable', ExistsForTenant::in('acc_fiscal_years')],
            'document_no' => 'nullable|string|max:50',
            'document_date' => 'required|date',
            'description' => 'nullable|string',
            'lines' => 'required|array|min:2',
            'lines.*.account_id' => ['required', ExistsForTenant::in('acc_chart_accounts')],
            'lines.*.debit' => 'nullable|numeric|min:0',
            'lines.*.credit' => 'nullable|numeric|min:0',
            'lines.*.description' => 'nullable|string',
        ]);

        $debit = collect($data['lines'])->sum(fn ($l) => (float) ($l['debit'] ?? 0));
        $credit = collect($data['lines'])->sum(fn ($l) => (float) ($l['credit'] ?? 0));

        if (abs($debit - $credit) >= 0.01 || $debit <= 0) {
            abort(response()->json(['message' => __('messages.journal_must_be_balanced')], 422));
        }

        return $data;
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     */
    private function writeLines(AccJournalEntry $entry, array $lines): void
    {
        foreach ($lines as $line) {
            AccJournalLine::query()->create([
                'journal_entry_id' => $entry->id,
                'account_id' => $line['account_id'],
                'debit' => $line['debit'] ?? 0,
                'credit' => $line['credit'] ?? 0,
                'description' => $line['description'] ?? null,
            ]);
        }
    }
}
