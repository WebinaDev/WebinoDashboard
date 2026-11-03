<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AccAccount;
use App\Models\AccInvoice;
use App\Models\AccJournal;
use App\Models\AccJournalLine;
use App\Models\AccMoadianJob;
use App\Models\AccPerson;
use App\Models\Order;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Services\Accounting\AccountingIntegrationsRegistry;
use App\Services\Accounting\MoadianService;
use App\Services\Accounting\OrderAccountingSync;
use App\Services\Webino\WebinoAccountingClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Validation\Rule;

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

        // Ledger uses domain identity; HMAC is optional service auth.
        $erpConfigured = filled(config('services.webino.base_url'));

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

        $syncedOrderIds = AccInvoice::query()
            ->where('tenant_id', $tid)
            ->whereNotNull('order_id')
            ->pluck('order_id');

        return response()->json([
            'data' => [
                'journals_count' => AccJournal::query()->where('tenant_id', $tid)->count(),
                'persons_count' => AccPerson::query()->where('tenant_id', $tid)->count(),
                'accounts_count' => AccAccount::query()->where('tenant_id', $tid)->count(),
                'draft_journals' => AccJournal::query()->where('tenant_id', $tid)->where('status', 'draft')->count(),
                'invoices_count' => AccInvoice::query()->where('tenant_id', $tid)->count(),
                'synced_orders_count' => $syncedOrderIds->unique()->count(),
                'pending_moadian' => AccInvoice::query()
                    ->where('tenant_id', $tid)
                    ->where(function ($q) {
                        $q->whereIn('moadian_status', ['queued', 'retry', 'pending'])
                            ->orWhereNull('moadian_status');
                    })
                    ->count(),
                'moadian_accepted' => AccInvoice::query()
                    ->where('tenant_id', $tid)
                    ->where('moadian_status', 'accepted')
                    ->count(),
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
                config('services.webino.product', 'webinodashboard'),
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

    public function invoicesIndex(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $items = AccInvoice::query()
            ->where('tenant_id', $tid)
            ->with(['lines', 'order:id,number,status,total_minor', 'person:id,name,phone'])
            ->orderByDesc('issue_date')
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        return response()->json(['data' => $items]);
    }

    public function invoiceShow(Request $request, int $invoice): JsonResponse
    {
        $row = AccInvoice::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->with(['lines', 'order', 'person', 'journal.lines', 'moadianJobs' => fn ($q) => $q->orderByDesc('id')->limit(10)])
            ->findOrFail($invoice);

        return response()->json(['data' => $row]);
    }

    public function syncOrder(Request $request, int $order, OrderAccountingSync $sync): JsonResponse
    {
        $model = Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->with('items')
            ->findOrFail($order);
        $invoice = $sync->syncOrder($model);

        return response()->json(['data' => $invoice], 201);
    }

    public function syncOrdersBulk(Request $request, OrderAccountingSync $sync): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'order_ids' => ['nullable', 'array'],
            'order_ids.*' => ['integer'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $q = Order::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', OrderAccountingSync::SYNC_STATUSES)
            ->with('items')
            ->orderByDesc('id')
            ->limit((int) ($data['limit'] ?? 50));

        if (! empty($data['order_ids'])) {
            $q->whereIn('id', $data['order_ids']);
        } else {
            $synced = AccInvoice::query()->where('tenant_id', $tid)->whereNotNull('order_id')->pluck('order_id');
            $q->whereNotIn('id', $synced);
        }

        $created = [];
        foreach ($q->get() as $order) {
            $created[] = $sync->syncOrder($order);
        }

        return response()->json(['data' => ['count' => count($created), 'invoices' => $created]]);
    }

    public function ordersSyncStatus(Request $request): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $synced = AccInvoice::query()
            ->where('tenant_id', $tid)
            ->whereNotNull('order_id')
            ->get(['id', 'order_id', 'number', 'moadian_status', 'moadian_reference', 'total_minor', 'status']);

        $eligible = Order::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', OrderAccountingSync::SYNC_STATUSES)
            ->orderByDesc('id')
            ->limit(100)
            ->get(['id', 'number', 'status', 'total_minor', 'customer_name', 'created_at']);

        $byOrder = $synced->keyBy('order_id');
        $rows = $eligible->map(function (Order $o) use ($byOrder) {
            $inv = $byOrder->get($o->id);

            return [
                'order' => $o,
                'synced' => (bool) $inv,
                'invoice' => $inv,
            ];
        });

        return response()->json([
            'data' => [
                'rows' => $rows,
                'unsynced_count' => $rows->where('synced', false)->count(),
                'synced_count' => $synced->count(),
            ],
        ]);
    }

    public function orderAccounting(Request $request, int $order): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        Order::query()->where('tenant_id', $tid)->findOrFail($order);

        $invoice = AccInvoice::query()
            ->where('tenant_id', $tid)
            ->where('order_id', $order)
            ->where('type', 'sale')
            ->with(['lines', 'person:id,name,phone', 'journal:id,number,status'])
            ->first();

        return response()->json([
            'data' => [
                'synced' => (bool) $invoice,
                'invoice' => $invoice,
                'can_sync' => true,
            ],
        ]);
    }

    public function reports(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $from = $request->query('from');
        $to = $request->query('to');

        $invoiceQ = AccInvoice::query()->where('tenant_id', $tid)->where('type', 'sale');
        if (is_string($from) && $from !== '') {
            $invoiceQ->whereDate('issue_date', '>=', $from);
        }
        if (is_string($to) && $to !== '') {
            $invoiceQ->whereDate('issue_date', '<=', $to);
        }

        $salesTotal = (clone $invoiceQ)->sum('total_minor');
        $taxTotal = (clone $invoiceQ)->sum('tax_minor');
        $invoiceCount = (clone $invoiceQ)->count();

        $moadian = AccInvoice::query()
            ->where('tenant_id', $tid)
            ->where('type', 'sale')
            ->selectRaw('COALESCE(moadian_status, ?) as status_key, COUNT(*) as c', ['not_sent'])
            ->groupBy('status_key')
            ->pluck('c', 'status_key');

        $eligible = Order::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', OrderAccountingSync::SYNC_STATUSES)
            ->count();
        $syncedOrders = AccInvoice::query()
            ->where('tenant_id', $tid)
            ->whereNotNull('order_id')
            ->pluck('order_id')
            ->unique()
            ->count();

        $recent = AccInvoice::query()
            ->where('tenant_id', $tid)
            ->with(['order:id,number', 'person:id,name'])
            ->orderByDesc('issue_date')
            ->orderByDesc('id')
            ->limit(12)
            ->get(['id', 'number', 'issue_date', 'total_minor', 'tax_minor', 'moadian_status', 'order_id', 'person_id']);

        return response()->json([
            'data' => [
                'sales_total_minor' => (int) $salesTotal,
                'tax_total_minor' => (int) $taxTotal,
                'invoice_count' => (int) $invoiceCount,
                'eligible_orders' => (int) $eligible,
                'synced_orders' => (int) $syncedOrders,
                'unsynced_orders' => max(0, (int) $eligible - (int) $syncedOrders),
                'moadian_breakdown' => $moadian,
                'recent_invoices' => $recent,
            ],
        ]);
    }

    public function moadianSettingsShow(Request $request, MoadianService $moadian): JsonResponse
    {
        return response()->json(['data' => $moadian->getSettings((int) $request->user()->tenant_id)]);
    }

    public function moadianSettingsUpdate(Request $request, MoadianService $moadian): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'economic_code' => ['sometimes', 'nullable', 'string', 'max:64'],
            'national_id' => ['sometimes', 'nullable', 'string', 'max:64'],
            'fiscal_id' => ['sometimes', 'nullable', 'string', 'max:64'],
            'api_key' => ['sometimes', 'nullable', 'string', 'max:512'],
            'client_id' => ['sometimes', 'nullable', 'string', 'max:128'],
            'client_secret' => ['sometimes', 'nullable', 'string', 'max:512'],
            'private_key' => ['sometimes', 'nullable', 'string', 'max:8000'],
            'base_url' => ['sometimes', 'nullable', 'string', 'max:255'],
            'hook_url' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sandbox' => ['sometimes', 'boolean'],
            'sandbox_base_url' => ['sometimes', 'nullable', 'string', 'max:255'],
            'auto_send_on_sync' => ['sometimes', 'boolean'],
        ]);

        return response()->json([
            'data' => $moadian->saveSettings((int) $request->user()->tenant_id, $data),
        ]);
    }

    public function moadianJobsIndex(Request $request): JsonResponse
    {
        $items = AccMoadianJob::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->with('invoice:id,number,order_id,moadian_status')
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        return response()->json(['data' => $items]);
    }

    public function moadianSendInvoice(Request $request, int $invoice, MoadianService $moadian): JsonResponse
    {
        $row = AccInvoice::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->findOrFail($invoice);
        $job = $moadian->enqueue($row, 'send');
        $job = $moadian->processJob($job);

        return response()->json(['data' => [
            'job' => $job,
            'invoice' => $row->fresh(['lines', 'order']),
        ]]);
    }

    public function moadianSendOrder(Request $request, int $order, OrderAccountingSync $sync, MoadianService $moadian): JsonResponse
    {
        $model = Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->with('items')
            ->findOrFail($order);
        $invoice = $sync->syncOrder($model);
        $job = $moadian->enqueue($invoice, 'send');
        $job = $moadian->processJob($job);

        return response()->json(['data' => [
            'job' => $job,
            'invoice' => $invoice->fresh(['lines', 'order']),
        ]]);
    }

    public function moadianProcess(Request $request, MoadianService $moadian): JsonResponse
    {
        $limit = (int) $request->input('limit', 10);

        return response()->json([
            'data' => $moadian->processDue((int) $request->user()->tenant_id, $limit),
        ]);
    }

    public function moadianRetry(Request $request, int $job, MoadianService $moadian): JsonResponse
    {
        $row = AccMoadianJob::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->findOrFail($job);
        $row->update(['status' => 'pending', 'run_after' => now()]);
        $row = $moadian->processJob($row);

        return response()->json(['data' => $row]);
    }

    public function integrationsHub(Request $request, AccountingIntegrationsRegistry $registry): JsonResponse
    {
        return response()->json(['data' => [
            'platforms' => $registry->hub((int) $request->user()->tenant_id),
        ]]);
    }

    public function integrationSettingsShow(Request $request, string $provider, AccountingIntegrationsRegistry $registry): JsonResponse
    {
        return response()->json(['data' => $registry->getSettings((int) $request->user()->tenant_id, $provider)]);
    }

    public function integrationSettingsUpdate(Request $request, string $provider, AccountingIntegrationsRegistry $registry): JsonResponse
    {
        return response()->json([
            'data' => $registry->saveSettings((int) $request->user()->tenant_id, $provider, $request->all()),
        ]);
    }

    public function integrationTest(Request $request, string $provider, AccountingIntegrationsRegistry $registry): JsonResponse
    {
        return response()->json(['data' => $registry->test((int) $request->user()->tenant_id, $provider)]);
    }

    public function integrationPushInvoice(Request $request, string $provider, int $invoice, AccountingIntegrationsRegistry $registry): JsonResponse
    {
        $row = AccInvoice::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->with('lines')
            ->findOrFail($invoice);

        $payload = [
            'Number' => $row->number,
            'DateTime' => $row->issue_date?->toDateString(),
            'InvoiceType' => 0,
            'Status' => 1,
            'ContactCode' => $row->person_id,
            'InvoiceItems' => $row->lines->map(fn ($l) => [
                'Description' => $l->description,
                'Quantity' => $l->qty,
                'UnitPrice' => $l->unit_price_minor,
                'Discount' => $l->discount_minor,
                'Tax' => $l->tax_minor,
            ])->all(),
        ];

        $res = $registry->pushInvoice((int) $request->user()->tenant_id, $provider, $payload);
        if ($res['ok'] ?? false) {
            $meta = is_array($row->meta) ? $row->meta : [];
            $meta['integrations'][$provider] = [
                'remote_id' => $res['remote_id'] ?? null,
                'pushed_at' => now()->toIso8601String(),
            ];
            $row->update(['meta' => $meta]);
        }

        return response()->json(['data' => $res], ($res['ok'] ?? false) ? 200 : 422);
    }
}

