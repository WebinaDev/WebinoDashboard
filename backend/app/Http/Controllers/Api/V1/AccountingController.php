<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AccAccount;
use App\Models\AccJournal;
use App\Models\AccJournalLine;
use App\Models\AccPerson;
use App\Models\TenantModule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Validation\Rule;
use App\Models\Tenant;
use App\Services\Webino\WebinoAccountingClient;

class AccountingController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $bundlePath = storage_path('app/bundles/accounting');

        $licensed = TenantModule::query()
            ->where('tenant_id', $tenantId)
            ->where('module_slug', 'accounting')
            ->where('licensed', true)
            ->exists();

        $bundlePresent = File::isDirectory($bundlePath);
        if ($bundlePresent) {
            $names = @scandir($bundlePath) ?: [];
            $bundlePresent = count(array_diff($names, ['.', '..'])) > 0;
        }

        $src = config('accounting.source_path');

        $erpConfigured = filled(config('services.webino.base_url'))
            && filled(config('services.webino.license_hmac_secret'));

        return response()->json([
            'data' => [
                'licensed' => $licensed,
                'bundle_present' => $bundlePresent,
                'bundle_path' => $bundlePath,
                'source_configured' => is_string($src) && $src !== '',
                'erp_ledger_configured' => $erpConfigured,
                'preferred_source' => $erpConfigured ? 'erp' : ($bundlePresent ? 'bundle' : 'local'),
            ],
        ]);
    }

    public function overview(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;

        return response()->json([
            'data' => [
                'journals_count' => AccJournal::query()->where('tenant_id', $tid)->count(),
                'persons_count' => AccPerson::query()->where('tenant_id', $tid)->count(),
                'accounts_count' => AccAccount::query()->where('tenant_id', $tid)->count(),
                'draft_journals' => AccJournal::query()->where('tenant_id', $tid)->where('status', 'draft')->count(),
            ],
        ]);
    }

    public function journalsIndex(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = AccJournal::query()
            ->where('tenant_id', $tid)
            ->with('lines')
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        return response()->json(['data' => $items]);
    }

    public function journalsStore(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'number' => [
                'required',
                'string',
                'max:64',
                Rule::unique('accounting_journals', 'number')->where('tenant_id', $tid),
            ],
            'date' => ['required', 'date'],
            'description' => ['nullable', 'string', 'max:500'],
            'status' => ['nullable', 'string', 'in:draft,posted'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.account_code' => ['required', 'string', 'max:32'],
            'lines.*.account_name' => ['required', 'string', 'max:255'],
            'lines.*.debit_minor' => ['nullable', 'integer', 'min:0'],
            'lines.*.credit_minor' => ['nullable', 'integer', 'min:0'],
        ]);

        $debit = 0;
        $credit = 0;
        foreach ($data['lines'] as $line) {
            $debit += (int) ($line['debit_minor'] ?? 0);
            $credit += (int) ($line['credit_minor'] ?? 0);
        }
        if ($debit !== $credit) {
            return response()->json([
                'message' => 'Journal is not balanced',
                'errors' => ['lines' => ['Total debit must equal total credit']],
            ], 422);
        }

        $journal = DB::transaction(function () use ($tid, $data, $debit, $credit) {
            $journal = AccJournal::query()->create([
                'tenant_id' => $tid,
                'number' => $data['number'],
                'date' => $data['date'],
                'description' => $data['description'] ?? null,
                'status' => $data['status'] ?? 'draft',
                'total_debit_minor' => $debit,
                'total_credit_minor' => $credit,
            ]);
            foreach ($data['lines'] as $line) {
                AccJournalLine::query()->create([
                    'journal_id' => $journal->id,
                    'account_code' => $line['account_code'],
                    'account_name' => $line['account_name'],
                    'debit_minor' => (int) ($line['debit_minor'] ?? 0),
                    'credit_minor' => (int) ($line['credit_minor'] ?? 0),
                ]);
            }

            return $journal->load('lines');
        });

        return response()->json(['data' => $journal], 201);
    }

    public function personsIndex(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = AccPerson::query()->where('tenant_id', $tid)->orderBy('name')->limit(200)->get();

        return response()->json(['data' => $items]);
    }

    public function personsStore(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:customer,vendor,employee'],
            'phone' => ['nullable', 'string', 'max:32'],
        ]);
        $person = AccPerson::query()->create(array_merge($data, ['tenant_id' => $tid]));

        return response()->json(['data' => $person], 201);
    }

    public function accountsIndex(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = AccAccount::query()->where('tenant_id', $tid)->orderBy('code')->limit(500)->get();

        return response()->json(['data' => $items]);
    }

    public function accountsStore(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'code' => [
                'required',
                'string',
                'max:32',
                Rule::unique('accounting_accounts', 'code')->where('tenant_id', $tid),
            ],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'max:32'],
        ]);
        $account = AccAccount::query()->create(array_merge($data, ['tenant_id' => $tid]));

        return response()->json(['data' => $account], 201);
    }
    /**
     * Prefer live ERP ledger; fall back to local journal lines when ERP unavailable.
     */
    public function ledger(Request $request, WebinoAccountingClient $erp): \Illuminate\Http\JsonResponse
    {
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);
        $filters = $request->only(['account_id', 'from', 'to', 'limit']);

        try {
            $res = $erp->ledger(
                $tenant->domain ?: $request->getHost(),
                $tenant->license_key,
                $filters
            );
        } catch (\Throwable $e) {
            $res = ['ok' => false, 'unavailable' => true, 'message' => $e->getMessage(), 'data' => null];
        }

        if ($res['ok'] ?? false) {
            $payload = is_array($res['data']) ? ($res['data']['data'] ?? $res['data']) : [];

            return response()->json([
                'data' => array_merge(is_array($payload) ? $payload : [], [
                    'source' => 'erp',
                ]),
            ]);
        }

        // Local fallback from accounting_journals
        $tid = $tenant->id;
        $lines = AccJournalLine::query()
            ->whereHas('journal', fn ($q) => $q->where('tenant_id', $tid))
            ->with('journal:id,number,date,description')
            ->orderByDesc('id')
            ->limit(min(500, max(1, (int) ($filters['limit'] ?? 100))))
            ->get()
            ->map(fn (AccJournalLine $l) => [
                'id' => $l->id,
                'account_code' => $l->account_code,
                'account_name' => $l->account_name,
                'debit' => (int) $l->debit_minor,
                'credit' => (int) $l->credit_minor,
                'debit_minor' => (int) $l->debit_minor,
                'credit_minor' => (int) $l->credit_minor,
                'document_no' => $l->journal?->number,
                'document_date' => $l->journal?->date,
                'line_description' => null,
                'entry_description' => $l->journal?->description,
            ]);

        return response()->json([
            'data' => [
                'lines' => $lines,
                'totals' => [
                    'debit_minor' => (int) $lines->sum('debit_minor'),
                    'credit_minor' => (int) $lines->sum('credit_minor'),
                ],
                'source' => 'local',
                'erp_unavailable' => true,
                'message' => $res['message'] ?? 'ERP ledger unavailable; showing local journals',
            ],
        ]);
    }


}
